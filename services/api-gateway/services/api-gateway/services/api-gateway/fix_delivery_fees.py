import shutil
import sys

FEE_CALC = "/mnt/datassd/projects-and-docs/lipasafe/services/api-gateway/src/utils/feeCalculator.js"
CONTROLLER = "/mnt/datassd/projects-and-docs/lipasafe/services/api-gateway/src/controllers/deliveryMpesa.controller.js"

def patch_file(path, old, new, label):
    with open(path, "r") as f:
        content = f.read()
    if old not in content:
        print("[SKIP] " + label + ": old string not found. Aborting.")
        sys.exit(1)
    if content.count(old) != 1:
        print("[SKIP] " + label + ": found " + str(content.count(old)) + " times, expected 1. Aborting.")
        sys.exit(1)
    shutil.copy(path, path + ".bak")
    content = content.replace(old, new)
    with open(path, "w") as f:
        f.write(content)
    print("[OK] " + label + ": patched. Backup at " + path + ".bak")

old_fee_calc = """function calcFeesDelivery(agreedAmount) {
  const amount      = new Decimal(agreedAmount)
  const platformFee = amount.times(PLATFORM_RATE).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
  const b2c         = new Decimal(b2cCost(amount))
  const totalFee    = platformFee.plus(b2c)
  const buyerTotal  = amount.plus(totalFee)
  return {
    platformFee:          platformFee,
    b2cCost:              b2c,
    totalFee:             totalFee,
    deliveryGuyReceives:  amount,
    buyerTotal:           buyerTotal,
  }
}"""

new_fee_calc = """function calcFeesDelivery(agreedAmount) {
  const amount         = new Decimal(agreedAmount)
  const rawPlatformFee = amount.times(PLATFORM_RATE).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
  const b2c            = new Decimal(b2cCost(amount))
  const rawTotal       = amount.plus(rawPlatformFee).plus(b2c)
  const buyerTotal     = rawTotal.toDecimalPlaces(0, Decimal.ROUND_CEIL)
  const platformFee    = buyerTotal.minus(amount).minus(b2c)
  const totalFee       = platformFee.plus(b2c)
  return {
    platformFee:          platformFee,
    b2cCost:              b2c,
    totalFee:             totalFee,
    deliveryGuyReceives:  amount,
    buyerTotal:           buyerTotal,
  }
}"""

patch_file(FEE_CALC, old_fee_calc, new_fee_calc, "feeCalculator.js: calcFeesDelivery")

old_controller = """    const amount    = new Decimal(order.amount)
    const fees      = calcFeesDelivery(amount)
    const fee       = fees.totalFee
    const total     = amount.plus(fees.totalFee).toNearest(1, Decimal.ROUND_HALF_UP)"""

new_controller = """    const amount    = new Decimal(order.amount)
    const fees      = calcFeesDelivery(amount)
    const fee       = fees.totalFee
    const total     = fees.buyerTotal"""

patch_file(CONTROLLER, old_controller, new_controller, "deliveryMpesa.controller.js: STK total")

print("Done. Run: pm2 restart api-gateway")
