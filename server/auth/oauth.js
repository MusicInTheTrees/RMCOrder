const { google } = require('googleapis');
const fs = require('fs');
const config = require('../config');

function createOAuth2Client() {
  return new google.auth.OAuth2(
    config.GOOGLE.CLIENT_ID,
    config.GOOGLE.CLIENT_SECRET,
    config.GOOGLE.REDIRECT_URI
  );
}

function loadTokens() {
  if (!fs.existsSync(config.TOKENS_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(config.TOKENS_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function saveTokens(tokens) {
  fs.writeFileSync(config.TOKENS_FILE, JSON.stringify(tokens, null, 2));
}

function clearTokens() {
  if (fs.existsSync(config.TOKENS_FILE)) fs.unlinkSync(config.TOKENS_FILE);
}

function getOAuth2Client() {
  const client = createOAuth2Client();
  const tokens = loadTokens();
  if (tokens) client.setCredentials(tokens);
  // Persist tokens whenever googleapis refreshes them. A refresh response often
  // omits refresh_token, so merge onto the stored set to avoid dropping it.
  client.on('tokens', (newTokens) => {
    const existing = loadTokens() || {};
    saveTokens({ ...existing, ...newTokens });
  });
  return client;
}

const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/userinfo.email',
];

module.exports = { createOAuth2Client, getOAuth2Client, loadTokens, saveTokens, clearTokens, SCOPES };
