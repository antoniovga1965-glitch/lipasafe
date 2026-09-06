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

const diasporaProofStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:          'lipasafe/diaspora-proof',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation:  [{ width: 1200, height: 1200, crop: 'limit', quality: 'auto' }],
  },
})
const uploadDiasporaProof = multer({ storage: diasporaProofStorage, limits: { fileSize: 5 * 1024 * 1024 } })

const diasporaRefPhotoStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:          'lipasafe/diaspora-reference',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation:  [{ width: 1200, height: 1200, crop: 'limit', quality: 'auto' }],
  },
})
const uploadDiasporaRefPhotos = multer({ storage: diasporaRefPhotoStorage, limits: { fileSize: 5 * 1024 * 1024 } })


const diasporaWorkProofStorage = new CloudinaryStorage({
  cloudinary,
  params: async (_req, file) => {
    const isVideo = file.mimetype.startsWith('video/')
    const isAudio = file.mimetype.startsWith('audio/')
    return {
      folder:          'lipasafe/diaspora-work-proof',
      resource_type:   isVideo || isAudio ? 'video' : 'image',
      chunk_size:      6000000,
      allowed_formats: isVideo
        ? ['mp4', 'mov', 'webm', 'avi']
        : isAudio
        ? ['mp3', 'wav', 'm4a', 'aac', 'ogg']
        : ['jpg', 'jpeg', 'png', 'webp'],
      ...(!isVideo && !isAudio && {
        transformation: [{ width: 1200, height: 1200, crop: 'limit', quality: 'auto' }],
      }),
    }
  },
})
const uploadDiasporaWorkProof = multer({
  storage:    diasporaWorkProofStorage,
  limits:     { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = [
      'image/jpeg','image/png','image/webp',
      'video/mp4','video/quicktime','video/webm','video/avi',
      'audio/mpeg','audio/wav','audio/x-m4a','audio/aac','audio/ogg',
    ]
    cb(ok.includes(file.mimetype) ? null : new Error('File type not allowed'), ok.includes(file.mimetype))
  },
})
module.exports = {
  cloudinary,
  uploadAvatar,
  uploadListingPhotos,
  uploadFundiPhotos,
  uploadDeliveryPhotos,
  uploadDisputeEvidence,
  uploadCustomEscrowPhotos,
  uploadDiasporaProof,
  uploadDiasporaWorkProof,
  uploadDiasporaRefPhotos,
}
