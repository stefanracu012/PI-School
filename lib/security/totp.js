/**
 * TOTP (Time-based One-Time Password) utilities
 * RFC 6238 compliant implementation
 */

import * as OTPAuth from 'otpauth'
import QRCode from 'qrcode'
import { encrypt, decrypt, generateSecureToken, hashSHA256 } from './crypto.js'

const APP_NAME = process.env.TOTP_APP_NAME || 'PI School'

/**
 * Generate a new TOTP secret
 * @returns {string} - Base32 encoded secret
 */
export function generateTOTPSecret() {
  const secret = new OTPAuth.Secret({ size: 20 })
  return secret.base32
}

/**
 * Generate TOTP URI for QR code
 * @param {string} secret - Base32 encoded secret
 * @param {string} email - User's email (account identifier)
 * @returns {string} - otpauth:// URI
 */
export function generateTOTPUri(secret, email) {
  // Build URI manually to avoid locale suffix issues
  const encodedIssuer = encodeURIComponent(APP_NAME)
  const encodedEmail = encodeURIComponent(email)
  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`
}

/**
 * Generate QR code data URL for TOTP setup
 * @param {string} uri - otpauth:// URI
 * @returns {Promise<string>} - Data URL for QR code image
 */
export async function generateQRCode(uri) {
  return await QRCode.toDataURL(uri, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 200,
    color: {
      dark: '#000000',
      light: '#ffffff'
    }
  })
}

/**
 * Verify a TOTP token
 * @param {string} token - 6-digit TOTP code
 * @param {string} secret - Base32 encoded secret (decrypted)
 * @returns {boolean} - Whether token is valid
 */
export function verifyTOTP(token, secret) {
  if (!token || !secret) {
    return false
  }
  
  // Normalize token (remove spaces, ensure 6 digits)
  const normalizedToken = token.toString().replace(/\s/g, '').padStart(6, '0')
  
  if (!/^\d{6}$/.test(normalizedToken)) {
    return false
  }
  
  try {
    const totp = new OTPAuth.TOTP({
      secret: OTPAuth.Secret.fromBase32(secret),
      algorithm: 'SHA1',
      digits: 6,
      period: 30
    })
    
    // validate returns delta (null if invalid, number if valid)
    const delta = totp.validate({ token: normalizedToken, window: 1 })
    return delta !== null
  } catch (error) {
    console.error('TOTP verification error:', error.message)
    return false
  }
}

/**
 * Encrypt TOTP secret for storage
 * @param {string} secret - Plain TOTP secret
 * @returns {string} - Encrypted secret
 */
export function encryptTOTPSecret(secret) {
  return encrypt(secret)
}

/**
 * Decrypt stored TOTP secret
 * @param {string} encryptedSecret - Encrypted secret from DB
 * @returns {string} - Decrypted TOTP secret
 */
export function decryptTOTPSecret(encryptedSecret) {
  return decrypt(encryptedSecret)
}

/**
 * Generate backup codes
 * @param {number} count - Number of codes to generate (default 10)
 * @returns {{ plainCodes: string[], hashedCodes: string[] }}
 */
export function generateBackupCodes(count = 10) {
  const plainCodes = []
  const hashedCodes = []
  
  for (let i = 0; i < count; i++) {
    // Generate 8 character alphanumeric code (no ambiguous chars)
    const code = generateSecureToken(5)
      .toUpperCase()
      .replace(/[0O1IL]/g, 'X') // Remove ambiguous characters
      .slice(0, 8)
    
    // Format as XXXX-XXXX for readability
    const formattedCode = `${code.slice(0, 4)}-${code.slice(4, 8)}`
    
    plainCodes.push(formattedCode)
    hashedCodes.push(hashSHA256(formattedCode.replace('-', '').toLowerCase()))
  }
  
  return { plainCodes, hashedCodes }
}

/**
 * Verify a backup code
 * @param {string} inputCode - User provided backup code
 * @param {string} storedHash - Stored hash of the backup code
 * @returns {boolean} - Whether code matches
 */
export function verifyBackupCode(inputCode, storedHash) {
  if (!inputCode || !storedHash) {
    return false
  }
  
  // Normalize input (remove dash, lowercase)
  const normalizedCode = inputCode.replace(/-/g, '').toLowerCase()
  const inputHash = hashSHA256(normalizedCode)
  
  // Use constant-time comparison
  const { constantTimeCompare } = require('./crypto.js')
  return constantTimeCompare(inputHash, storedHash)
}

/**
 * Get current TOTP code (for testing only)
 * @param {string} secret - Base32 secret
 * @returns {string} - Current TOTP code
 */
export function getCurrentTOTP(secret) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('getCurrentTOTP should not be used in production')
  }
  const totp = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(secret),
    algorithm: 'SHA1',
    digits: 6,
    period: 30
  })
  return totp.generate()
}
