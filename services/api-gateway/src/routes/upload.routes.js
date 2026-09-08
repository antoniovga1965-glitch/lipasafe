'use strict'
const express    = require('express')
const router     = express.Router()
const auth       = require('../middleware/layer2-identity/auth')
const { cloudinary } = require('../utils/cloudinary')

// POST /upload/dispute-photos
// Body: { photos: ['data:image/jpeg;base64,...'], context: 'house_dispute' }
router.post('/dispute-photos', auth, async (req, res) => {
  try {
    const { photos, context = 'dispute' } = req.body
    if (!photos || !Array.isArray(photos) || photos.length === 0)
      return res.status(400).json({ success: false, message: 'No photos provided' })
    if (photos.length > 3)
      return res.status(400).json({ success: false, message: 'Max 3 photos allowed' })

    const uploads = await Promise.all(
      photos.map(base64 =>
        cloudinary.uploader.upload(base64, {
          folder:          `lipasafe/dispute-evidence/${context}`,
          allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
          transformation:  [{ width: 1200, height: 1200, crop: 'limit', quality: 'auto' }],
        })
      )
    )

    return res.json({ success: true, urls: uploads.map(u => u.secure_url) })
  } catch (err) {
    console.error('dispute-photos upload error', err.message)
    return res.status(500).json({ success: false, message: err.message })
  }
})

module.exports = router
