const { expect } = require('chai');
const express = require('express');
const http = require('http');
const axios = require('axios');
const AuthManager = require('../lib/auth');

describe('App Routes and Authentication Middleware Integration', () => {
  let app;
  let server;
  let baseUrl;
  let authManager;

  before((done) => {
    app = express();
    app.use(express.json());

    authManager = new AuthManager({
      auth: {
        enabled: true,
        sessionSecret: 'route-test-secret',
        allowedEmails: ['tochiming@gmail.com'],
      },
    });

    app.use((req, res, next) => {
      req.cookies = authManager.parseCookies(req);
      next();
    });

    // Public auth routes
    app.get('/login', (req, res) => {
      const user = authManager.getSessionUser(req);
      if (user) return res.redirect('/');
      res.send('<html>Login Page Content</html>');
    });

    app.get('/auth/login', (req, res) => {
      if (authManager.hasGoogleCredentials()) {
        return res.redirect(authManager.getAuthUrl());
      }
      return res.redirect(
        '/login?error=auth_failed&msg=' +
          encodeURIComponent('Google OAuth not configured')
      );
    });

    app.get('/auth/logout', (req, res) => {
      authManager.clearSessionCookie(res);
      res.redirect('/login');
    });

    app.get('/auth/config', (req, res) => {
      res.json({
        enabled: authManager.isEnabled(),
        hasGoogleAuth: authManager.hasGoogleCredentials(),
      });
    });

    // User profile endpoint
    app.get('/auth/me', (req, res) => {
      const user = authManager.getSessionUser(req);
      if (!user) {
        return res.status(401).json({ authenticated: false, user: null });
      }
      res.json({ authenticated: true, user });
    });

    // Protected middleware
    app.use(authManager.getMiddleware());

    // Protected routes
    app.get('/', (req, res) => {
      res.send('<html>Dashboard Page</html>');
    });

    app.get('/events', (req, res) => {
      res.json([{ id: 'ev1', name: 'Soccer Game' }]);
    });

    server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      done();
    });
  });

  after((done) => {
    server.close(done);
  });

  it('serves login page when unauthenticated', async () => {
    const res = await axios.get(`${baseUrl}/login`);
    expect(res.status).to.equal(200);
    expect(res.data).to.include('Login Page Content');
  });

  it('returns auth config without exposing allowedEmails', async () => {
    const res = await axios.get(`${baseUrl}/auth/config`);
    expect(res.status).to.equal(200);
    expect(res.data.enabled).to.be.true;
    expect(res.data.allowedEmails).to.be.undefined;
  });

  it('redirects unauthenticated browser request for / to /login', async () => {
    const res = await axios.get(`${baseUrl}/`, {
      headers: { Accept: 'text/html' },
      maxRedirects: 0,
      validateStatus: (status) => status === 302,
    });
    expect(res.headers.location).to.equal('/login');
  });

  it('redirects /auth/login to /login with error when google credentials not set', async () => {
    const res = await axios.get(`${baseUrl}/auth/login`, {
      maxRedirects: 0,
      validateStatus: (status) => status === 302,
    });
    expect(res.headers.location).to.include('/login?error=auth_failed');
  });

  it('returns 401 for unauthenticated API request to /events', async () => {
    try {
      await axios.get(`${baseUrl}/events`, {
        headers: { Accept: 'application/json' },
      });
      expect.fail('Should have thrown 401');
    } catch (err) {
      expect(err.response.status).to.equal(401);
      expect(err.response.data.error).to.equal('Unauthorized');
      expect(err.response.data.loginUrl).to.equal('/login');
    }
  });

  it('allows access to protected routes and /auth/me with valid session cookie', async () => {
    const token = authManager.createSessionToken({
      email: 'tochiming@gmail.com',
      name: 'Chi Ming To',
    });

    const meRes = await axios.get(`${baseUrl}/auth/me`, {
      headers: { Cookie: `gcs_session=${token}` },
    });
    expect(meRes.status).to.equal(200);
    expect(meRes.data.authenticated).to.be.true;
    expect(meRes.data.user.email).to.equal('tochiming@gmail.com');

    const eventsRes = await axios.get(`${baseUrl}/events`, {
      headers: { Cookie: `gcs_session=${token}` },
    });
    expect(eventsRes.status).to.equal(200);
    expect(eventsRes.data).to.be.an('array');
    expect(eventsRes.data[0].name).to.equal('Soccer Game');
  });

  it('clears session cookie on /auth/logout', async () => {
    const res = await axios.get(`${baseUrl}/auth/logout`, {
      maxRedirects: 0,
      validateStatus: (status) => status === 302,
    });
    expect(res.headers.location).to.equal('/login');
    expect(res.headers['set-cookie'][0]).to.include('Max-Age=0');
  });
});
