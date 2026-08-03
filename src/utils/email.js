'use strict'

const { Resend } = require('resend')

const sendOTP = async (email, otp, type = 'register') => {
  const resend = new Resend(process.env.RESEND_API_KEY)

  const isReset = type === 'reset'
  const isChangePin = type === 'changepin'

  const heading = isReset ? 'Reset your PIN' : isChangePin ? 'Confirm PIN change' : 'Verify your identity'
  const subtext = isReset
    ? 'Use the code below to reset your LipaSafe PIN. If you did not request this, secure your account immediately.'
    : isChangePin
    ? 'Use the code below to confirm your LipaSafe PIN change. If you did not request this, secure your account immediately.'
    : 'Enter the code below in the LipaSafe app to complete your registration. This code expires in <strong>10 minutes</strong>.'

  await resend.emails.send({
    from: 'LipaSafe <onboarding@resend.dev>',
    to: email,
    subject: isReset ? `${otp} — Your LipaSafe PIN Reset Code` : isChangePin ? `${otp} — Confirm Your PIN Change` : `${otp} is your LipaSafe verification code`,
    html: `
    <div style="font-family:'Segoe UI',Arial,sans-serif;background:#f0faf4;padding:40px 0;min-height:100vh">
      <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 32px rgba(0,168,107,0.10)">
        <div style="background:linear-gradient(135deg,#00C47A,#00A86B);padding:36px 32px;text-align:center">
          <div style="display:inline-block;background:rgba(255,255,255,0.15);border-radius:16px;padding:10px 24px;margin-bottom:12px">
            <span style="color:#ffffff;font-size:22px;font-weight:900;letter-spacing:1.5px">LipaSafe</span>
          </div>
          <p style="color:rgba(255,255,255,0.85);margin:0;font-size:13px;letter-spacing:0.5px">Lipa Salama. Daima.</p>
        </div>
        <div style="padding:40px 32px">
          <h2 style="color:#0a2e1a;font-size:22px;font-weight:800;margin:0 0 10px">${heading}</h2>
          <p style="color:#4b7a5e;font-size:15px;margin:0 0 32px;line-height:1.7">${subtext}</p>
          <div style="background:#f0faf4;border:2px solid #00A86B;border-radius:16px;padding:32px;text-align:center;margin-bottom:32px">
            <p style="color:#00A86B;font-size:11px;text-transform:uppercase;letter-spacing:3px;margin:0 0 14px;font-weight:600">Verification Code</p>
            <div style="font-size:48px;font-weight:900;letter-spacing:14px;color:#00A86B;font-family:monospace">${otp}</div>
          </div>
          <div style="background:#fff8e6;border-left:4px solid #f59e0b;padding:14px 18px;border-radius:8px;margin-bottom:28px">
            <p style="color:#92400e;font-size:13px;margin:0;line-height:1.6">
              🔒 <strong>Security notice:</strong> LipaSafe will never call or message you asking for this code. Do not share it with anyone.
            </p>
          </div>
          <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0;line-height:1.6">
            Didn't request this? You can safely ignore this email.<br/>Your account remains secure.
          </p>
        </div>
        <div style="background:#f0faf4;padding:20px 32px;text-align:center;border-top:1px solid #d1fae5">
          <p style="color:#4b7a5e;font-size:12px;margin:0 0 4px;font-weight:600">LipaSafe Limited</p>
          <p style="color:#94a3b8;font-size:11px;margin:0">Nairobi, Kenya · lipasafe.co.ke</p>
        </div>
      </div>
    </div>
    `,
  })
}

module.exports = { sendOTP }
