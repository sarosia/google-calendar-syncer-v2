const { expect } = require('chai');
const AuthManager = require('../lib/auth');

describe('AuthManager', () => {
  const dummyLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
  };

  describe('Configuration & Whitelist', () => {
    it('initializes with default options and allowed emails', () => {
      const unconfigured = new AuthManager({}, dummyLogger);
      expect(unconfigured.isEnabled()).to.be.false;
      expect(unconfigured.getAllowedEmails()).to.deep.equal([]);

      const auth = new AuthManager(
        {
          auth: {
            clientId: 'test-client-id',
            clientSecret: 'test-client-secret',
          },
        },
        dummyLogger
      );
      expect(auth.isEnabled()).to.be.true;
    });

    it('respects configured allowed emails with case normalization', () => {
      const auth = new AuthManager(
        {
          auth: {
            allowedEmails: ['ToChiMing@gmail.com ', ' USER2@example.com '],
          },
        },
        dummyLogger
      );
      expect(auth.getAllowedEmails()).to.deep.equal([
        'tochiming@gmail.com',
        'user2@example.com',
      ]);
      expect(auth.isAllowed('tochiming@gmail.com')).to.be.true;
      expect(auth.isAllowed('TOCHIMING@GMAIL.COM')).to.be.true;
      expect(auth.isAllowed('user2@example.com')).to.be.true;
      expect(auth.isAllowed('stranger@evil.com')).to.be.false;
      expect(auth.isAllowed(null)).to.be.false;
    });

    it('detects google credentials presence', () => {
      const noCreds = new AuthManager({}, dummyLogger);
      expect(noCreds.hasGoogleCredentials()).to.be.false;

      const withCreds = new AuthManager(
        {
          auth: {
            clientId: 'client-123.apps.googleusercontent.com',
            clientSecret: 'secret-xyz',
          },
        },
        dummyLogger
      );
      expect(withCreds.hasGoogleCredentials()).to.be.true;
    });
  });

  describe('Session Tokens & Tamper Proofing', () => {
    const auth = new AuthManager(
      {
        auth: {
          sessionSecret: 'test-secret-key-1234567890',
          sessionMaxAge: '1h',
          allowedEmails: ['tochiming@gmail.com'],
        },
      },
      dummyLogger
    );

    it('creates and verifies valid session tokens', () => {
      const user = {
        email: 'tochiming@gmail.com',
        name: 'Chi Ming To',
        picture: 'https://example.com/avatar.jpg',
      };
      const token = auth.createSessionToken(user);
      expect(token).to.be.a('string');
      expect(token).to.include('.');

      const verified = auth.verifySessionToken(token);
      expect(verified).to.not.be.null;
      expect(verified.email).to.equal('tochiming@gmail.com');
      expect(verified.name).to.equal('Chi Ming To');
      expect(verified.picture).to.equal('https://example.com/avatar.jpg');
      expect(verified.exp).to.be.above(Date.now());
    });

    it('rejects tampered session tokens', () => {
      const token = auth.createSessionToken({ email: 'tochiming@gmail.com' });
      const [payloadBase64, signature] = token.split('.');

      // Tamper with payload (e.g. change email)
      const tamperedPayload = Buffer.from(
        JSON.stringify({
          email: 'attacker@evil.com',
          exp: Date.now() + 60000,
        })
      ).toString('base64url');
      const tamperedToken = `${tamperedPayload}.${signature}`;

      expect(auth.verifySessionToken(tamperedToken)).to.be.null;

      // Tamper with signature
      const badSigToken = `${payloadBase64}.invalidSignature12345`;
      expect(auth.verifySessionToken(badSigToken)).to.be.null;
    });

    it('rejects expired tokens', () => {
      const shortAuth = new AuthManager(
        {
          auth: {
            sessionSecret: 'test-secret-key-1234567890',
            sessionMaxAge: -1000, // already expired
            allowedEmails: ['tochiming@gmail.com'],
          },
        },
        dummyLogger
      );
      const token = shortAuth.createSessionToken({
        email: 'tochiming@gmail.com',
      });
      expect(shortAuth.verifySessionToken(token)).to.be.null;
    });

    it('rejects token if user is no longer on whitelist', () => {
      const token = auth.createSessionToken({ email: 'tochiming@gmail.com' });

      // Create new AuthManager where tochining is NOT allowed
      const newAuth = new AuthManager(
        {
          auth: {
            sessionSecret: 'test-secret-key-1234567890',
            allowedEmails: ['someoneelse@example.com'],
          },
        },
        dummyLogger
      );
      expect(newAuth.verifySessionToken(token)).to.be.null;
    });
  });

  describe('Cookies & Headers', () => {
    const auth = new AuthManager(
      {
        auth: {
          sessionSecret: 'cookie-test-secret',
          allowedEmails: ['tochiming@gmail.com'],
        },
      },
      dummyLogger
    );

    it('parses cookie headers correctly', () => {
      const req = {
        headers: {
          cookie: 'gcs_session=abc123xyz; theme=dark; other=hello%20world',
        },
      };
      const cookies = auth.parseCookies(req);
      expect(cookies.gcs_session).to.equal('abc123xyz');
      expect(cookies.theme).to.equal('dark');
      expect(cookies.other).to.equal('hello world');
    });

    it('sets session cookie with proper headers', () => {
      const headers = {};
      const res = {
        setHeader: (k, v) => {
          headers[k] = v;
        },
      };
      auth.setSessionCookie(res, { email: 'tochiming@gmail.com' }, false);
      expect(headers['Set-Cookie']).to.include('gcs_session=');
      expect(headers['Set-Cookie']).to.include('HttpOnly');
      expect(headers['Set-Cookie']).to.include('SameSite=Lax');
      expect(headers['Set-Cookie']).to.include('Path=/');
    });

    it('clears session cookie', () => {
      const headers = {};
      const res = {
        setHeader: (k, v) => {
          headers[k] = v;
        },
      };
      auth.clearSessionCookie(res);
      expect(headers['Set-Cookie']).to.include('gcs_session=');
      expect(headers['Set-Cookie']).to.include('Max-Age=0');
    });
  });

  describe('Middleware Behavior', () => {
    const auth = new AuthManager(
      {
        auth: {
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          sessionSecret: 'middleware-test-secret',
          allowedEmails: ['tochiming@gmail.com'],
        },
      },
      dummyLogger
    );
    const middleware = auth.getMiddleware();

    it('allows authenticated requests and attaches req.user', (done) => {
      const token = auth.createSessionToken({
        email: 'tochiming@gmail.com',
        name: 'Chi Ming To',
      });
      const req = {
        headers: {
          cookie: `gcs_session=${token}`,
        },
        path: '/events',
      };
      const res = {};
      middleware(req, res, () => {
        expect(req.user).to.exist;
        expect(req.user.email).to.equal('tochiming@gmail.com');
        done();
      });
    });

    it('redirects unauthenticated HTML requests to /login', () => {
      let redirectUrl = null;
      const req = {
        method: 'GET',
        headers: {
          accept: 'text/html,application/xhtml+xml',
        },
        path: '/',
        originalUrl: '/',
      };
      const res = {
        redirect: (url) => {
          redirectUrl = url;
        },
      };
      middleware(req, res, () => {});
      expect(redirectUrl).to.equal('/login');
    });

    it('returns 401 JSON for unauthenticated API requests', () => {
      let statusCode = null;
      let jsonBody = null;
      const req = {
        method: 'GET',
        headers: {
          accept: 'application/json',
        },
        path: '/events',
      };
      const res = {
        status: (code) => {
          statusCode = code;
          return {
            json: (body) => {
              jsonBody = body;
            },
          };
        },
      };
      middleware(req, res, () => {});
      expect(statusCode).to.equal(401);
      expect(jsonBody.error).to.equal('Unauthorized');
      expect(jsonBody.loginUrl).to.equal('/login');
    });

    it('bypasses middleware if auth is disabled', (done) => {
      const disabledAuth = new AuthManager(
        { auth: { enabled: false } },
        dummyLogger
      );
      const disabledMiddleware = disabledAuth.getMiddleware();
      const req = { headers: {}, path: '/events' };
      const res = {};
      disabledMiddleware(req, res, () => {
        done();
      });
    });
  });
});
