'use strict';
const { HttpError } = require('./lib/http');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_AVATAR_LENGTH = 400000; // data-URL images are compressed by the frontend to ~200 KB

const isString = (v) => typeof v === 'string';

// Same rules as the frontend sign-up form (validatePassword in app.js).
function passwordProblem(password) {
  if (!isString(password) || password.length === 0) return 'Password is required.';
  if (password.length < 6) return 'Password must be at least 6 characters.';
  if (password.length > 128) return 'Password must be 128 characters or fewer.';
  if (!/[A-Z]/.test(password)) return 'Password must include at least 1 capital letter.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must include at least 1 symbol (e.g. ! @ # $).';
  return null;
}

function checkName(value, errors) {
  if (!isString(value) || !value.trim()) errors.name = 'Name is required.';
  else if (value.trim().length > 100) errors.name = 'Name must be 100 characters or fewer.';
}

function checkEmail(value, errors) {
  if (!isString(value) || !EMAIL_RE.test(value.trim()) || value.trim().length > 254) {
    errors.email = 'A valid email address is required.';
  }
}

// null / '' removes the avatar; otherwise it must be an image data-URL or http(s) URL.
function normalizeAvatar(value, errors) {
  if (value === null || value === '') return null;
  if (!isString(value) || value.length > MAX_AVATAR_LENGTH || !/^(data:image\/|https?:\/\/)/i.test(value)) {
    errors.avatar = 'Avatar must be an image data URL or an http(s) URL (max 400 KB).';
    return undefined;
  }
  return value;
}

function throwIfAny(errors) {
  if (Object.keys(errors).length) throw new HttpError(400, 'Validation failed', errors);
}

function validateRegister(body) {
  const errors = {};
  checkName(body.name, errors);
  checkEmail(body.email, errors);
  const pwProblem = passwordProblem(body.password);
  if (pwProblem) errors.password = pwProblem;
  throwIfAny(errors);
  return { name: body.name.trim(), email: body.email.trim().toLowerCase(), password: body.password };
}

function validateLogin(body) {
  const errors = {};
  if (!isString(body.email) || !body.email.trim()) errors.email = 'Email is required.';
  if (!isString(body.password) || !body.password) errors.password = 'Password is required.';
  throwIfAny(errors);
  return { email: body.email.trim().toLowerCase(), password: body.password };
}

// Only the fields that are present are returned (so a PUT can change just one).
function validateProfile(body) {
  const errors = {};
  const patch = {};
  if (body.name !== undefined) {
    checkName(body.name, errors);
    if (!errors.name) patch.name = body.name.trim();
  }
  if (body.avatar !== undefined) {
    const avatar = normalizeAvatar(body.avatar, errors);
    if (!errors.avatar) patch.avatar = avatar;
  }
  throwIfAny(errors);
  if (Object.keys(patch).length === 0) {
    throw new HttpError(400, 'Validation failed', { body: 'Provide a name and/or an avatar to update.' });
  }
  return patch;
}

module.exports = { passwordProblem, validateRegister, validateLogin, validateProfile };
