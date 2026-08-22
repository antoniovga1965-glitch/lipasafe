"use strict";
const prisma = require("../utils/prisma");
const logger = require("../utils/logger");
const smsQueue = require("../queues/smsQueue");
const b2cRetryQueue = require("../queues/b2cRetryQueue");

const POLL_INTERVAL_MS = 60 * 1000;
const normalizePhone = (phone) => {
  const p = phone.toString().replace(/\s+/g, "");
  let normalized;
  if (p.startsWith("+254")) normalized = p.slice(1);
  else if (p.startsWith("0")) normalized = "254" + p.slice(1);
  else if (p.startsWith("254")) normalized = p;
  else throw new Error(`Invalid phone: ${phone}`);
  if (!/^254\d{9}$/.test(normalized))
    throw new Error(`Invalid phone: ${phone}`);
  return normalized;
};

const processOverdueOrders = async () => {
  try {
    const now = new Date();

    // find all IN_TRANSIT orders where timer has expired
    const overdueOrders = await prisma.deliveryOrder.findMany({
      where: {
        status: "IN_TRANSIT",
        setDeliveryTime: { lt: now },
      },
      include: {
        escrow: true,
      },
    });

    if (overdueOrders.length === 0) return;

    logger.info(
      `Auto-refund check: ${overdueOrders.length} overdue orders found`,
    );

    for (const order of overdueOrders) {
      try {
        const hasDuringPhoto = await prisma.deliveryPhoto.count({
          where: {
            orderId: order.id,
            photoType: "DURING",
          },
        });
        if (hasDuringPhoto) {
          await prisma.deliveryOrder.update({
            where: { id: order.id },
            data: { status: "DELIVERY_OVERDUE" },
          });
          await prisma.deliveryTimeline.create({
            data: {
              orderId: order.id,
              event: "DELIVERY_OVERDUE",
              actor: "SYSTEM",
              details: JSON.stringify({
                reason: "Timer expired but during photo exists",
              }),
              timestamp: now,
            },
          });
          logger.info(
            "Order overdue but during photo exists — marked DELIVERY_OVERDUE",
            { orderId: order.id },
          );
          continue;
        }

        // no during photo + timer expired = auto refund
        const buyer = await prisma.user.findUnique({
          where: { id: order.buyerId },
          select: { phone: true },
        });

        if (!order.escrow) {
          logger.warn("Auto-refund skipped — no escrow found", {
            orderId: order.id,
          });
          continue;
        }

        // atomic status update — prevent double processing
        const updated = await prisma.deliveryOrder.updateMany({
          where: { id: order.id, status: "IN_TRANSIT" },
          data: { status: "AUTO_REFUNDED" },
        });

        if (updated.count === 0) {
          logger.warn("Auto-refund skipped — order already processed", {
            orderId: order.id,
          });
          continue;
        }

        await prisma.deliveryTimeline.create({
          data: {
            orderId: order.id,
            event: "AUTO_REFUND_INITIATED",
            actor: "SYSTEM",
            details: JSON.stringify({
              reason: "Timer expired, no during photo uploaded",
            }),
            timestamp: now,
          },
        });

        // queue refund to buyer via b2c-retry — already has a working consumer (b2cRetryWorker.js)
        // that handles type: 'delivery-refund' and calls deliveryB2cPayout to the buyer's phone
        await b2cRetryQueue.add(
          "delivery-refund",
          {
            orderId: order.id,
            type: "delivery-refund",
            amount: order.escrow.amount.toString(),
          },
          {
            jobId: `delivery-refund-${order.id}`,
            attempts: 10,
            backoff: { type: "exponential", delay: 5000 },
          },
        );
        // notify both
        await smsQueue.add("send-sms", {
          type: "raw",
          to: normalizePhone(buyer.phone),
          message: `LipaSafe: Delivery timeout for order ${order.id.slice(0, 8).toUpperCase()}. Your refund of KES ${order.escrow.amount} is being processed.`,
        });
        await smsQueue.add("send-sms", {
          type: "raw",
          to: normalizePhone(order.deliveryGuyPhone),
          message: `LipaSafe: Order ${order.id.slice(0, 8).toUpperCase()} expired — you did not upload a delivery photo in time. Buyer has been refunded.`,
        });

        logger.info("Auto-refund queued", {
          orderId: order.id,
          amount: order.escrow.amount.toString(),
        });
      } catch (orderErr) {
        logger.error("Auto-refund failed for order", {
          orderId: order.id,
          err: orderErr.message,
        });
      }
    }
  } catch (err) {
    logger.error("Auto-refund worker error", { err: err.message });
  }
};

// start polling
logger.info("Delivery auto-refund worker started");
processOverdueOrders();
setInterval(processOverdueOrders, POLL_INTERVAL_MS);

module.exports = { processOverdueOrders };
