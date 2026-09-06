
const updatePushToken = async (req, res) => {
  try {
    const { pushToken } = req.body
    if (!pushToken) return res.status(400).json({ success: false, message: 'pushToken required' })
    await prisma.user.update({
      where: { id: req.user.userId },
      data:  { pushToken },
    })
    return res.json({ success: true })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message })
  }
}
module.exports = { ...module.exports, updatePushToken }
