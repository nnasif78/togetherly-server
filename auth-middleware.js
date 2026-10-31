import { jwtVerify, createRemoteJWKSet } from "jose";

let JWKS;

function getJwks() {
  if (!JWKS) {
    const frontendUrl = process.env.CLIENT_URL;
    if (!frontendUrl) {
      throw new Error("CLIENT_URL environment variable is required for JWT verification.");
    }

    const normalizedFrontendUrl = frontendUrl.replace(/\/+$/, "");
    JWKS = createRemoteJWKSet(new URL(`${normalizedFrontendUrl}/api/auth/jwks`));
  }

  return JWKS;
}

export async function verifyToken(req, res, next) {
  try {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      return res.status(401).send({ message: "Unauthorized. Token required." });
    }

    const token = authorization.split(" ")[1];

    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: process.env.CLIENT_URL,
      audience: process.env.CLIENT_URL,
    });

    req.user = {
      id: payload.sub,
      email: payload.email,
    };

    next();
  } catch (error) {
    console.error("JWT verification error:", error.message);
    res.status(401).send({ message: "Invalid or expired token." });
  }
}
