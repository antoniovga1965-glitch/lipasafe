'use strict'
const prisma        = require('../src/utils/prisma')
const redis         = require('../src/utils/redis')
const { initiateSTK } = require('../src/utils/Mpesastk')
const { FLOAT_ID }  = require('../src/utils/diasporaConstants')

// GET /diaspora/admin/float
const getFloat = async (req, res) => {
  try {
    const float = await prisma.diasporaFloat.findUnique({
      where: { id: FLOAT_ID },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    })
    if (!float) return res.status(404).json({ success: false, message: 'Float not found' })
    return res.json({ success: true, float })
  } catch (err) {
    console.error('getFloat error:', err)
    return res.status(500).json({ success: false, message: 'Failed to fetch float' })
  }
}

// POST /diaspora/admin/float/add  — triggers STK push
const addFloat = async (req, res) => {
  const { amount, phone, note } = req.body
  if (!amount || isNaN(amount) || Number(amount) <= 0)
    return res.status(400).json({ success: false, message: 'Valid amount required' })
  if (!phone)
    return res.status(400).json({ success: false, message: 'Phone number required' })

  try {
    const callbackURL = process.env.MPESA_FLOAT_CALLBACK_URL
    const stk = await initiateSTK({
      phone,
      amount:     Number(amount),
      accountRef: 'FloatLoad',
      description: 'Float top-up',
      callbackURL,
    })

    // Store pending in Redis — 10 min TTL
    await redis.set(
      `float:stk:${stk.CheckoutRequestID}`,
      JSON.stringify({
        amount:  Number(amount),
        note:    note || 'Manual bank transfer',
        addedBy: req.user?.id || 'secretary',
      }),
      'EX', 600
    )

    return res.json({
      success: true,
      message: 'STK push sent — waiting for M-Pesa confirmation',
      checkoutRequestId: stk.CheckoutRequestID,
    })
  } catch (err) {
    console.error('addFloat STK error:', err)
    return res.status(500).json({ success: false, message: err.message || 'STK push failed' })
  }
}

// POST /diaspora/mpesa/float/callback  — Safaricom callback (no auth)
const floatStkCallback = async (req, res) => {
  try {
    const body     = req.body?.Body?.stkCallback
    if (!body) return res.json({ ResultCode: 0, ResultDesc: 'Accepted' })

    const { CheckoutRequestID, ResultCode, CallbackMetadata } = body
    if (ResultCode !== 0) {
      console.warn('Float STK failed by user:', ResultCode)
      await redis.del(`float:stk:${CheckoutRequestID}`)
      return res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
    }

    const meta    = {}
    for (const item of CallbackMetadata?.Item || []) {
      meta[item.Name] = item.Value
    }

    const pending = await redis.get(`float:stk:${CheckoutRequestID}`)
    if (!pending) {
      console.warn('Float STK callback — no pending record for', CheckoutRequestID)
      return res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
    }

    const { amount, note, addedBy } = JSON.parse(pending)
    const mpesaRef = meta.MpesaReceiptNumber || CheckoutRequestID

    await prisma.$transaction([
      prisma.diasporaFloat.update({
        where: { id: FLOAT_ID },
        data:  {
          balance:     { increment: amount },
          lastUpdated: new Date(),
        },
      }),
      prisma.diasporaFloatTx.create({
        data: {
          floatId:   FLOAT_ID,
          type:      'ADD',
          amount,
          reference: mpesaRef,
          addedBy,
          note,
        },
      }),
    ])

    await redis.del(`float:stk:${CheckoutRequestID}`)
    console.log(`Float credited KES ${amount} — ref ${mpesaRef}`)
    return res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  } catch (err) {
    console.error('floatStkCallback error:', err)
    return res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  }
}

module.exports = { getFloat, addFloat, floatStkCallback }
