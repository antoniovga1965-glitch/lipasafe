'use strict'
const cloudinary = require('cloudinary').v2
const { CloudinaryStorage } = require('multer-storage-cloudinary')
const multer = require('multer')

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const avatarStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:          'lipasafe/avatars',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation:  [{ width: 300, height: 300, crop: 'fill', gravity: 'face' }],
  },
})
const uploadAvatar = multer({ storage: avatarStorage, limits: { fileSize: 10 * 1024 * 1024 } })

const listingStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:          'lipasafe/listings',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation:  [{ width: 1000, height: 1000, crop: 'limit', quality: 'auto' }],
  },
})
const uploadListingPhotos = multer({ storage: listingStorage, limits: { fileSize: 10 * 1024 * 1024 } })

const fundiStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:          'lipasafe/fundi',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation:  [{ width: 1200, height: 1200, crop: 'limit', quality: 'auto' }],
  },
})
const uploadFundiPhotos = multer({ storage: fundiStorage, limits: { fileSize: 5 * 1024 * 1024 } })

const deliveryStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:          'lipasafe/delivery',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation:  [{ width: 1200, height: 1200, crop: 'limit', quality: 'auto' }],
  },
})
const uploadDeliveryPhotos = multer({ storage: deliveryStorage, limits: { fileSize: 10 * 1024 * 1024 } })

const disputeEvidenceStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:          'lipasafe/dispute-evidence',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation:  [{ width: 1200, height: 1200, crop: 'limit', quality: 'auto' }],
  },
})
const uploadDisputeEvidence = multer({ storage: disputeEvidenceStorage, limits: { fileSize: 10 * 1024 * 1024 } })

const customEscrowStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:          'lipasafe/custom-escrow',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation:  [{ width: 1200, height: 1200, crop: 'limit', quality: 'auto' }],
  },
})
const uploadCustomEscrowPhotos = multer({ storage: customEscrowStorage, limits: { fileSize: 10 * 1024 * 1024 } })

module.exports = {
  cloudinary,
  uploadAvatar,
  uploadListingPhotos,
  uploadFundiPhotos,
  uploadDeliveryPhotos,
  uploadDisputeEvidence,
  uploadCustomEscrowPhotos,
}
