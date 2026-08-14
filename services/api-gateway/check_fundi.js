const prisma = require('./src/utils/prisma')
;(async () => {
  const jobId = process.argv[2]
  const job = await prisma.fundiJob.findUnique({
    where: { id: jobId },
    include: { escrow: true, fundiPayouts: true }
  })
  console.log(JSON.stringify(job, null, 2))
  await prisma.$disconnect()
})()
