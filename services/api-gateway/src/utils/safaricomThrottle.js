'use strict'

class SafaricomThrottle {
  constructor () {
    this.maxPerWindow = 5
    this.windowMs     = 60_000
    this.minGapMs     = 13_000
    this.timestamps   = []
    this.lastSentAt   = 0
  }

  async wait () {
  
    const gapWait = this.minGapMs - (Date.now() - this.lastSentAt)
    if (gapWait > 0) {
      console.info(`[SafaricomThrottle] burst guard — waiting ${(gapWait/1000).toFixed(1)}s`)
      await this._sleep(gapWait)
    }

    while (true) {
      const now = Date.now()
      this.timestamps = this.timestamps.filter(t => now - t < this.windowMs)
      if (this.timestamps.length < this.maxPerWindow) break
      const waitMs = this.windowMs - (now - this.timestamps[0]) + 500
      console.info(`[SafaricomThrottle] window full — waiting ${(waitMs/1000).toFixed(1)}s`)
      await this._sleep(waitMs)
    }

    this.timestamps.push(Date.now())
    this.lastSentAt = Date.now()
  }

  _sleep (ms) { return new Promise(r => setTimeout(r, ms)) }
}

module.exports = new SafaricomThrottle()
