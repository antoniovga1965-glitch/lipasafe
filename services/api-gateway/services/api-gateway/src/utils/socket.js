'use strict'
let _io = null
module.exports = {
  setIo:      (io)                  => { _io = io },
  getIo:      ()                    => _io,
  emitToUser: (userId, event, data) => { if (_io) _io.to(`user:${userId}`).emit(event, data) },
}
