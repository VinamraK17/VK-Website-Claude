import { notifyContact } from "./lib/notify";
import fs from "fs";
import { loadInsights, fill, renderListItems, renderArticleValues, renderRss, extendSitemap } from "./lib/insights";
import {
  newsletterConfig, normaliseEmail, isValidEmail, isToken, cleanSource, subscribe, confirmSubscription,
  unsubscribe, resubscribe, saveFeedback, purgeExpired, confirmEmail, smtpSender, sendIssue, sendJob,
  subscribeFormHtml, messagePage, feedbackFormHtml, FEEDBACK_REASONS, RETENTION, CONSENT_VERSION,
} from "./lib/newsletter";
import express from "express";
import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { UAParser } from "ua-parser-js";

dotenv.config();

// Prisma Setup (SQLite on NAS volume)
const dbUrl = process.env.DATABASE_URL || "file:/app/data/portfolio.db";
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: dbUrl,
    },
  },
});

// Escape HTML special characters to prevent injection in email bodies
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function seedData() {
  // ── Content source of truth ──────────────────────────────────────────────
  // These two arrays are the ONLY place site content lives. pages/experience.html
  // carries a mirrored FALLBACK_EXPERIENCES array for when the API is unreachable;
  // regenerate it with `node scripts/sync-fallback.mjs` after editing this file.
  const projectsToSeed = [
    {
      title: "Enterprise AI Transformation",
      tag: "Agentic AI",
      stats: "3 of 4 Streams",
      image: "/img/projects/ai-transformation.svg",
      description: "Leads three of the four streams of Sunrise's enterprise AI transformation programme — AI workflow and process automation, AI journey transformation, and AI-first journeys — alongside concurrent platform evaluations for agentic AI and the governance around them.",
      order: 0
    },
    {
      title: "NEXUS: AI Troubleshooting",
      tag: "Telecom AI",
      stats: "5M+ Customers",
      image: "/img/projects/nexus.svg",
      description: "Led the team that built and shipped NEXUS — an LLM-powered troubleshooting platform reaching 5M+ customers at Sunrise GmbH, deflecting inbound technical support volume and reducing cost to serve.",
      order: 1
    },
    {
      title: "GenAI Strategy & MVP",
      tag: "Digital Transformation",
      stats: "CHF 8M Run-Rate",
      image: "/img/projects/genai.svg",
      description: "Defined and delivered the enterprise GenAI roadmap for Sunrise — automating customer care journeys and building to a CHF 8M annualised savings run-rate across the digital transformation and GenAI portfolio.",
      order: 2
    },
    {
      title: "Aviation IT Portfolio Modernisation",
      tag: "Aviation Software",
      stats: "5 Days → 2 Days",
      image: "/img/projects/portfolio.svg",
      description: "Modernised a fragmented 77-application aviation IT portfolio at Lufthansa Systems FlightNav AG — cutting data production from five days to two, a 60% efficiency gain, and 40% cost savings beyond annual targets.",
      order: 3
    },
    {
      title: "Data-Driven Aviation Maps",
      tag: "Aviation Software",
      stats: "ICAO Certified",
      image: "/img/projects/maps.svg",
      description: "Led the end-to-end programme replacing manual static chart production with a dynamic, data-driven generation platform — defining the data quality requirements and securing certification against ICAO standards.",
      order: 4
    },
    {
      title: "Leadership Across Aviation & Telecoms",
      tag: "Strategy & Leadership",
      stats: "20+ Years | 2 Industries",
      image: "/img/projects/leadership.svg",
      description: "A two-decade leadership track across aviation and telecoms — from a 19-person production team supplying navigation charts to pilots at 300+ airlines, to enterprise AI transformation at Switzerland's largest telecom.",
      order: 5
    },
    {
      title: "Pro Bono Mentoring",
      tag: "Mentoring",
      stats: "10+ Mentees",
      image: "/img/projects/mentoring.svg",
      description: "Voluntary one-to-one mentoring of professionals across technology, business, and career transition — sharing 20+ years of leadership, AI, and product management experience to create tangible impact.",
      order: 6
    }
  ];

  const experiencesToSeed = [
    {
      company: "Sunrise GmbH",
      role: "Manager Digital Transformation",
      period: "Mar 2024 – Present",
      location: "Zurich, Switzerland",
      description: "Owning the digital product strategy for Switzerland's largest telecom, aligning six customer-journey teams plus IT, business, data specialists and external partners around a unified transformation roadmap.",
      achievements: [
        "AI Transformation Mandate: Leads three of the four streams of the enterprise AI transformation programme since June 2026 — AI workflow and process automation, AI journey transformation, and AI-first journeys.",
        "Platform Selection: Runs concurrent platform evaluations for agentic AI and AI agent platforms — requirements, evaluation criteria, proof-of-concept design, build-vs-buy and commercial assessment, and the recommendation to the decision board.",
        "AI Governance: Defines agentic AI governance — guardrails, human-in-the-loop design, data access, security, and vendor lock-in — and leads the AI workflow automation proof of concept from use-case selection through to the business case for scaling.",
        "Customer Experience: Led the enterprise SSO implementation across digital entry points after KPI analysis exposed inconsistent login journeys, raising login success rate and NPS from 70% to 90%.",
        "Risk Governance: Surfaces delivery, security, data and dependency risks early and coordinates the decisions across six journey teams.",
        "Financial Performance: CHF 8M annualised savings run-rate across the digital transformation and GenAI portfolio."
      ],
      order: 0
    },
    {
      company: "Sunrise GmbH",
      role: "Product Owner Digital Transformation",
      period: "Sep 2022 – Feb 2024",
      location: "Zürich Metropolitan Area",
      description: "Led the team that built and shipped NEXUS — an LLM-powered AI troubleshooting platform reaching 5M+ customers — taking a cross-functional team of 15+ from zero to full production and reducing inbound technical support volume.",
      achievements: [
        "NEXUS Delivery: Built and led the team that delivered Sunrise's first AI-driven troubleshooting solution, owning requirements, data preparation, model-training coordination, testing and feedback loops end to end.",
        "Cost Optimisation: Exceeded departmental cost targets by 20% beyond a CHF 2M target in 2023 by redesigning team operating models around the customer journey.",
        "Agile Delivery: Surpassed departmental performance targets by 20% by owning product delivery end-to-end — from vision and business case through to launch and iteration.",
        "Team Development: Hired, coached and developed the team through competing priorities."
      ],
      order: 1
    },
    {
      company: "Lufthansa Systems FlightNav AG",
      role: "Product Owner",
      period: "Mar 2018 – Aug 2022",
      location: "Zurich, Switzerland (Hybrid)",
      description: "Modernised a mission-critical internal application portfolio of 77 tools — leading a cross-functional team of 12 across Zurich and Gdansk, plus Product Standards, Windows and iOS teams.",
      achievements: [
        "Operational Efficiency: Improved data production efficiency by 60%, cutting the cycle from five days to two, and raised monthly data production from 300 to 420.",
        "Cost Performance: Delivered 40% cost savings beyond annual targets by replacing legacy workflows with agile, automation-first practices.",
        "Risk & Compliance Management: Established application risk registers covering security, technology lifecycle and operational continuity across all 77 aviation applications, meeting stringent international aeronautical regulatory standards.",
        "Global Team Alignment: Unified stakeholder alignment across two international locations, eliminating release delays through structured backlog management."
      ],
      order: 2
    },
    {
      company: "Lufthansa Systems FlightNav AG",
      role: "Production Manager Data Driven Maps Program Lido/Navigation",
      period: "Feb 2016 – Feb 2018",
      location: "Zurich, Switzerland",
      description: "Launched a first-of-its-kind production process for the Data Driven Maps Program from zero to full implementation — defining quality standards, securing regulatory certifications, and scaling operations on time.",
      achievements: [
        "Regulatory Certification: Defined the data quality requirements (DQR) and secured certification against ICAO standards.",
        "Procurement Cost Optimisation: Built the business case and ran rigorous make-or-buy analyses, selecting the optimal mix of external partners and internal capabilities.",
        "Vendor Governance: Selected, onboarded and governed a new external vendor, defining the transition plan, required skills and training.",
        "Risk Mitigation: Mitigated programme delivery risk by designing a transition plan that bridged current operations with future objectives."
      ],
      order: 3
    },
    {
      company: "Lufthansa Systems FlightNav AG",
      role: "Manager Production Lido/Navigation",
      period: "Mar 2012 – Mar 2016",
      location: "Zurich, Switzerland",
      description: "Led a multicultural production team of 19 producing navigation charts used by pilots at 300+ airlines globally, managing the full AIRAC cycle and ensuring on-time, compliant delivery to airline customers.",
      achievements: [
        "Process Optimisation: Improved data production efficiency by over 30%, shortening the cycle from 28 days to 20.",
        "Quality: Reduced quality complaints by 40%.",
        "People Development: Drove team performance and retention by owning hiring, compensation decisions, onboarding and the mentoring of new managers in Gdansk.",
        "Cross-Site Coordination: Restructured communication and process workflows between Zurich and Gdansk, eliminating delays."
      ],
      order: 4
    },
    {
      company: "Lufthansa Systems FlightNav AG",
      role: "Quality Assurance / Aeronautical Chart Specialist",
      period: "May 2009 – May 2012",
      location: "Zurich, Switzerland",
      description: "Maintained zero-defect delivery of aeronautical charts to airline customers through regulatory QA oversight of navigation data against ICAO standards across every AIRAC cycle.",
      achievements: [
        "Regulatory QA: Validated safety-critical aeronautical products against ICAO standards, investigated quality issues and coordinated corrective actions with audit-ready documentation.",
        "Mentorship: Accelerated team capability by mentoring and training new hires, reducing onboarding time.",
        "Quality Controls: Led the testing and evaluation of new tools before production integration, protecting operational continuity."
      ],
      order: 5
    },
    {
      company: "Airports Authority of India (AAI)",
      role: "Air Traffic Controller",
      period: "Apr 2006 – May 2009",
      location: "Greater Delhi Area, India",
      description: "Ensured the safe and efficient movement of hundreds of aircraft and thousands of passengers daily at IGI Airport New Delhi — operating ATC (Non-Radar) services across Delhi FIR with zero margin for error.",
      achievements: [
        "Capacity Expansion: Contributed directly to airport capacity expansion by participating in the commissioning of Runway 11/29 and developing new ATC procedures.",
        "Controller Training: Developed training notes, presentations, and simulator exercises for the Area Control Centre, raising performance standards."
      ],
      order: 6
    },
    {
      company: "Pro Bono / Independent",
      role: "Career & Leadership Mentor",
      period: "Ongoing",
      location: "Switzerland / Remote",
      description: "Voluntary one-to-one mentoring of professionals across technology, business, and early-career backgrounds — guiding individuals through career transitions, first-time leadership challenges, and pivots into AI and product management.",
      achievements: [
        "Career Transitions: Guided multiple mentees through successful industry pivots and role changes, providing frameworks for personal positioning, interview preparation, and stakeholder navigation.",
        "Leadership Development: Coached first-time managers and team leads through the practical challenges of moving from individual contributor to people leader.",
        "AI & Product Strategy: Shared hands-on experience from enterprise AI and digital transformation programmes to help technology professionals identify and pursue high-impact career directions.",
        "Outcomes: Mentees achieved a range of milestones — including new roles, promotions, and significant gains in professional confidence and strategic clarity."
      ],
      order: 7
    }
  ];

  // ── Content-aware reseed ─────────────────────────────────────────────────
  // Previously this compared only row COUNT (and project titles), so editing the
  // text of an achievement, a date or a figure never reached the database: the
  // container restarted and MariaDB kept serving the old copy. Compare content.
  const norm = (rows: any[], keys: string[]) =>
    JSON.stringify(rows.map(r => keys.map(k => String(r[k] ?? ""))));

  const projectKeys = ["title", "tag", "stats", "image", "description", "order"];
  const existingProjects = await prisma.project.findMany({ orderBy: { order: "asc" } });
  if (norm(existingProjects, projectKeys) !== norm(projectsToSeed, projectKeys)) {
    console.log("Projects changed — reseeding.");
    await prisma.project.deleteMany();
    await prisma.project.createMany({ data: projectsToSeed });
  }

  const experienceRows = experiencesToSeed.map(e => ({
    ...e,
    achievements: JSON.stringify(e.achievements)
  }));
  const expKeys = ["company", "role", "period", "location", "description", "achievements", "order"];
  const existingExperiences = await prisma.experience.findMany({ orderBy: { order: "asc" } });
  if (norm(existingExperiences, expKeys) !== norm(experienceRows, expKeys)) {
    console.log("Experience history changed — reseeding.");
    await prisma.experience.deleteMany();
    for (const row of experienceRows) {
      await prisma.experience.create({ data: row });
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Trust the Cloudflare tunnel / reverse proxy in front of this container so
  // req.ip and req.secure reflect the real client (used for rate limiting & logging).
  app.set("trust proxy", 1);

  app.use(express.json());

  // ── Security headers (applied to every response) ────────────────────────
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        // Scripts and styles are all first-party now. 'unsafe-inline' still has to
        // stay: 78 inline event handlers (75 onclick, 3 oninput) and 5 inline
        // <script> blocks. Removing it means refactoring those to addEventListener
        // and hashing the blocks — see security_spec.md.
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        // Fonts are self-hosted; no third-party font origin is trusted any more.
        "font-src 'self'",
        // Was "https:", which trusted every host on the internet for images.
        "img-src 'self' data:",
        "connect-src 'self'",
        "frame-src 'none'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
        "upgrade-insecure-requests",
      ].join("; ")
    );
    // Isolate the browsing context: a page this one opens cannot reach back
    // through window.opener, and other origins cannot embed our responses.
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    // Keep the admin dashboard out of search engines/caches.
    if (req.path.startsWith("/admin") || req.path.startsWith("/api/admin")) {
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      res.setHeader("Cache-Control", "no-store");
    }
    next();
  });

  // Sitemap: the static file plus every published Insights issue. Registered
  // before express.static so it wins over public/sitemap.xml.
  app.get("/sitemap.xml", (req, res) => {
    try {
      const base = fs.readFileSync(path.join(process.cwd(), "public", "sitemap.xml"), "utf8");
      res.type("application/xml").setHeader("Cache-Control", "public, max-age=3600");
      res.send(extendSitemap(base, loadInsights()));
    } catch (err: any) {
      res.status(500).type("text/plain").send("Sitemap unavailable");
    }
  });

  // Serve static assets (images, robots.txt, sitemap, etc.) from /public
  // Static assets. Everything referenced from HTML now carries a ?v= query, so
  // those files can be cached hard and busted by changing the query string.
  // Unversioned files (robots.txt, sitemap.xml, manifest) keep a short TTL.
  const ONE_YEAR = 60 * 60 * 24 * 365;
  app.use(express.static(path.join(process.cwd(), 'public'), {
    maxAge: '1h',
    setHeaders(res, filePath) {
      if (/\.(css|js|png|jpe?g|webp|avif|svg|ico|woff2?)$/i.test(filePath)) {
        res.setHeader('Cache-Control', `public, max-age=${ONE_YEAR}, immutable`);
      }
    },
  }));

  // Try to seed data (ignore if fails during build/env issues)
  seedData().catch(err => console.warn("Seed failed (ignorable if DB not ready):", err.message));

  // Rate limiting for public contact form submissions (mitigate spam/flooding)
  const CONTACT_MAX_REQUESTS = 5;
  const CONTACT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
  const contactAttempts = new Map<string, { count: number; firstAttempt: number }>();

  // Periodically cleanup expired contact attempts
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of contactAttempts) {
      if (now - entry.firstAttempt > CONTACT_WINDOW_MS) {
        contactAttempts.delete(ip);
      }
    }
  }, 60 * 60 * 1000);

  // Contact Form Endpoint
  app.post("/api/contact", async (req, res) => {
    try {
      const { name, email, message, website_url } = req.body;

      // Honeypot check: Bots fill hidden fields; humans do not
      if (website_url) {
        const ip = (req.ip || req.socket?.remoteAddress || "unknown").toString();
        console.warn(`[CONTACT SPAM] Honeypot triggered from ${ip}`);
        return res.json({
          success: true,
          message: "Thank you! Verification successful.",
          email: "contact@vinamrakumar.com"
        });
      }

      // Rate limit check
      const ip = (req.ip || req.socket?.remoteAddress || "unknown").toString();
      const now = Date.now();
      const currentAttempt = contactAttempts.get(ip);

      if (currentAttempt) {
        if (now - currentAttempt.firstAttempt <= CONTACT_WINDOW_MS) {
          if (currentAttempt.count >= CONTACT_MAX_REQUESTS) {
            const retryAfterSec = Math.ceil((currentAttempt.firstAttempt + CONTACT_WINDOW_MS - now) / 1000);
            res.setHeader("Retry-After", String(retryAfterSec));
            return res.status(429).json({
              success: false,
              error: "Too many messages sent. Please wait a few minutes before trying again."
            });
          }
          currentAttempt.count += 1;
        } else {
          contactAttempts.set(ip, { count: 1, firstAttempt: now });
        }
      } else {
        contactAttempts.set(ip, { count: 1, firstAttempt: now });
      }

      if (!name || !email || !message) {
        return res.status(400).json({ success: false, error: "Name, email, and message are required." });
      }

      // Length limits — prevent oversized payloads bloating the DB
      if (String(name).length > 100) {
        return res.status(400).json({ success: false, error: "Name must be 100 characters or fewer." });
      }
      if (String(email).length > 254) {
        return res.status(400).json({ success: false, error: "Email address is too long." });
      }
      if (String(message).length > 5000) {
        return res.status(400).json({ success: false, error: "Message must be 5,000 characters or fewer." });
      }

      // Basic email format check
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(String(email))) {
        return res.status(400).json({ success: false, error: "Please provide a valid email address." });
      }

      console.log(`[CONTACT] Message from ${name} <${email}>`);

      // Store in SQLite via Prisma
      const saved = await prisma.message.create({
        data: {
          name,
          email,
          message
        }
      });

      // Notify, then record the outcome so the admin console shows what was
      // actually delivered. ntfy is on the same Docker network, so this adds
      // milliseconds; it is bounded by an 8s timeout either way.
      try {
        const outcome = await notifyContact(name, email, message);
        await prisma.message.update({ where: { id: saved.id }, data: outcome });
      } catch (notifyErr: any) {
        console.error("[NOTIFY] recording outcome failed:", notifyErr?.message ?? notifyErr);
      }
      
      res.json({ 
        success: true, 
        message: "Thank you! Verification successful.",
        email: "contact@vinamrakumar.com" // Return the email on success
      });
    } catch (error: any) {
      console.error("Error in /api/contact:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Reveal Email Endpoint (Restricted - now requires form submission to be accessible via logic)
  app.get("/api/reveal-email", (req, res) => {
    res.status(403).json({ error: "Email revelation now requires verification via contact form." });
  });

  // Reveal Phone Endpoint
  app.get("/api/reveal-phone", (req, res) => {
    const phone = process.env.CONTACT_PHONE;
    if (!phone) return res.status(404).json({ error: "Phone not configured." });
    res.json({ phone });
  });

  // Projects Endpoint
  app.get("/api/projects", async (req, res) => {
    try {
      const projects = await prisma.project.findMany({
        orderBy: { order: "asc" }
      });
      res.json(projects);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  // Experiences Endpoint
  app.get("/api/experiences", async (req, res) => {
    try {
      const experiences = await prisma.experience.findMany({
        orderBy: { order: "asc" }
      });
      res.json(experiences.map(e => ({
        ...e,
        achievements: JSON.parse(e.achievements as string)
      })));
    } catch (error) {
      console.error("Error fetching experiences:", error);
      res.status(500).json({ error: "Failed to fetch experiences" });
    }
  });

  // DB Status Endpoint for NAS/Self-hosting verification
  app.get("/api/db-status", async (req, res) => {
    try {
      // SQLite is embedded — a simple query is sufficient to confirm the file is readable
      await prisma.$queryRaw`SELECT 1`;
      res.json({
        connected: true,
        type: "SQLite",
        persistence: "SQLite (Synology NAS volume)",
        status: "active"
      });
    } catch (err) {
      res.json({
        connected: false,
        type: "SQLite",
        persistence: "Storage Unavailable",
        status: "offline"
      });
    }
  });

  // Analytics Endpoint
  app.post("/api/analytics", async (req, res) => {
    try {
      const { event, details, sessionId } = req.body;

      // Country: Cloudflare sets this header automatically for proxied requests.
      // Falls back to other common proxy headers if not behind Cloudflare.
      const country =
        (req.headers["cf-ipcountry"] as string) ||
        (req.headers["x-vercel-ip-country"] as string) ||
        null;

      // Device / browser / OS from User-Agent (no extra PII beyond what's
      // already sent with every request).
      const ua = new UAParser(req.headers["user-agent"] || "").getResult();
      const deviceType = ua.device.type || "desktop"; // mobile | tablet | desktop
      const deviceVendor = ua.device.vendor || null; // e.g. Apple, Samsung
      const browser = ua.browser.name || null;
      const os = ua.os.name || null;

      const referrer = (details && details.referrer) || null;

      await prisma.analytics.create({
        data: {
          event,
          details: JSON.stringify(details || {}),
          sessionId: sessionId || null,
          country,
          deviceType,
          deviceVendor,
          browser,
          os,
          referrer
        }
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error saving analytics:", error);
      res.status(500).json({ success: false });
    }
  });

  // ── Admin middleware ──────────────────────────────────────────────────────

  // Constant-time string comparison (mitigates timing attacks on the admin password).
  function safeCompare(a: string, b: string): boolean {
    const ha = crypto.createHash("sha256").update(a).digest();
    const hb = crypto.createHash("sha256").update(b).digest();
    return crypto.timingSafeEqual(ha, hb);
  }

  // Brute-force protection: lock out an IP after too many failed admin logins.
  const ADMIN_MAX_ATTEMPTS = 5;
  const ADMIN_ATTEMPT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
  const ADMIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
  const adminAttempts = new Map<string, { count: number; firstAttempt: number; lockedUntil: number }>();

  // Periodically forget old/expired entries so the map doesn't grow forever.
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of adminAttempts) {
      if (now > entry.lockedUntil && now - entry.firstAttempt > ADMIN_ATTEMPT_WINDOW_MS) {
        adminAttempts.delete(ip);
      }
    }
  }, 60 * 60 * 1000);

  function requireAdmin(req: any, res: any, next: any) {
    const adminPassword = process.env.ADMIN_PASSWORD?.trim();
    if (!adminPassword) return res.status(503).json({ error: "Admin access not configured." });

    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    const now = Date.now();
    const entry = adminAttempts.get(ip);

    if (entry && now < entry.lockedUntil) {
      const retryAfterSec = Math.ceil((entry.lockedUntil - now) / 1000);
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({ error: "Too many failed login attempts. Try again later." });
    }

    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

    if (!token || !safeCompare(token, adminPassword)) {
      const current = entry && now - entry.firstAttempt <= ADMIN_ATTEMPT_WINDOW_MS
        ? entry
        : { count: 0, firstAttempt: now, lockedUntil: 0 };
      current.count += 1;
      if (current.count >= ADMIN_MAX_ATTEMPTS) {
        current.lockedUntil = now + ADMIN_LOCKOUT_MS;
        console.warn(`[ADMIN] Locked out ${ip} for ${ADMIN_LOCKOUT_MS / 60000}min after ${current.count} failed login attempts.`);
      }
      adminAttempts.set(ip, current);
      console.warn(`[ADMIN] Failed login attempt from ${ip} at ${new Date(now).toISOString()} (path: ${req.path})`);
      return res.status(401).json({ error: "Unauthorised." });
    }

    // Successful auth — clear any record of prior failed attempts for this IP.
    adminAttempts.delete(ip);
    next();
  }

  // Admin: all messages
  app.get("/api/admin/messages", requireAdmin, async (req, res) => {
    try {
      const messages = await prisma.message.findMany({ orderBy: { createdAt: "desc" } });
      res.json(messages);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  // Admin: analytics summary + raw events
  app.get("/api/admin/analytics", requireAdmin, async (req, res) => {
    try {
      const events = await prisma.analytics.findMany({ orderBy: { createdAt: "desc" }, take: 1000 });

      const summary: Record<string, number> = {};
      const pageViews: Record<string, number> = {};
      const countries: Record<string, number> = {};
      const devices: Record<string, number> = {};
      const deviceVendors: Record<string, number> = {};
      const browsers: Record<string, number> = {};
      const operatingSystems: Record<string, number> = {};
      const referrers: Record<string, number> = {};

      type SessionAcc = {
        pageViews: { path: string; at: Date }[];
        firstSeen: Date;
        lastSeen: Date;
        newVisitor: boolean | null;
        durations: { path: string; duration: number }[];
        scrollDepths: { path: string; depth: number }[];
      };
      const sessions: Record<string, SessionAcc> = {};

      for (const e of events) {
        summary[e.event] = (summary[e.event] || 0) + 1;

        if (e.country) countries[e.country] = (countries[e.country] || 0) + 1;
        if (e.deviceType) devices[e.deviceType] = (devices[e.deviceType] || 0) + 1;
        if (e.deviceVendor) deviceVendors[e.deviceVendor] = (deviceVendors[e.deviceVendor] || 0) + 1;
        if (e.browser) browsers[e.browser] = (browsers[e.browser] || 0) + 1;
        if (e.os) operatingSystems[e.os] = (operatingSystems[e.os] || 0) + 1;

        let d: any = {};
        try { d = JSON.parse(e.details); } catch {}

        if (e.event === "page_view") {
          const p = d.path || "unknown";
          pageViews[p] = (pageViews[p] || 0) + 1;

          const ref = e.referrer || d.referrer || "";
          if (!ref) {
            referrers["Direct / None"] = (referrers["Direct / None"] || 0) + 1;
          } else {
            try {
              const host = new URL(ref).hostname.replace(/^www\./, "");
              if (!host.includes("vinamrakumar.com")) {
                referrers[host] = (referrers[host] || 0) + 1;
              }
            } catch {
              referrers[ref] = (referrers[ref] || 0) + 1;
            }
          }
        }

        // Session bucketing (sessionId comes from the client; falls back to
        // a per-event pseudo-session so older/anonymous events don't crash this).
        const sid = e.sessionId || `anon-${e.id}`;
        if (!sessions[sid]) {
          sessions[sid] = {
            pageViews: [],
            firstSeen: e.createdAt,
            lastSeen: e.createdAt,
            newVisitor: null,
            durations: [],
            scrollDepths: []
          };
        }
        const s = sessions[sid];
        if (e.createdAt < s.firstSeen) s.firstSeen = e.createdAt;
        if (e.createdAt > s.lastSeen) s.lastSeen = e.createdAt;
        if (e.event === "page_view") s.pageViews.push({ path: d.path || "unknown", at: e.createdAt });
        if (e.event === "page_exit") {
          if (typeof d.duration === "number") s.durations.push({ path: d.path || "unknown", duration: d.duration });
          if (typeof d.scrollDepth === "number") s.scrollDepths.push({ path: d.path || "unknown", depth: d.scrollDepth });
        }
        if (typeof d.newVisitor === "boolean") s.newVisitor = d.newVisitor;
      }

      // ── Session-derived metrics ──────────────────────────────────────────
      const entryPages: Record<string, number> = {};
      const exitPages: Record<string, number> = {};
      const timeOnPageAcc: Record<string, { total: number; count: number }> = {};
      const scrollDepthAcc: Record<string, { total: number; count: number }> = {};

      let totalSessions = 0;
      let bouncedSessions = 0;
      let newVisitors = 0;
      let returningVisitors = 0;
      let sessionDurationTotal = 0;
      let sessionDurationCount = 0;

      for (const sid of Object.keys(sessions)) {
        const s = sessions[sid];
        if (s.pageViews.length === 0) continue;

        totalSessions++;
        s.pageViews.sort((a, b) => a.at.getTime() - b.at.getTime());
        const entry = s.pageViews[0].path;
        const exit = s.pageViews[s.pageViews.length - 1].path;
        entryPages[entry] = (entryPages[entry] || 0) + 1;
        exitPages[exit] = (exitPages[exit] || 0) + 1;

        if (s.pageViews.length === 1) bouncedSessions++;

        if (s.newVisitor === true) newVisitors++;
        else if (s.newVisitor === false) returningVisitors++;

        const durationMs = s.lastSeen.getTime() - s.firstSeen.getTime();
        if (durationMs > 0) {
          sessionDurationTotal += durationMs;
          sessionDurationCount++;
        }

        for (const t of s.durations) {
          if (!timeOnPageAcc[t.path]) timeOnPageAcc[t.path] = { total: 0, count: 0 };
          timeOnPageAcc[t.path].total += t.duration;
          timeOnPageAcc[t.path].count++;
        }
        for (const sd of s.scrollDepths) {
          if (!scrollDepthAcc[sd.path]) scrollDepthAcc[sd.path] = { total: 0, count: 0 };
          scrollDepthAcc[sd.path].total += sd.depth;
          scrollDepthAcc[sd.path].count++;
        }
      }

      const avgTimeOnPage: Record<string, number> = {};
      for (const p of Object.keys(timeOnPageAcc)) {
        avgTimeOnPage[p] = Math.round(timeOnPageAcc[p].total / timeOnPageAcc[p].count);
      }
      const avgScrollDepth: Record<string, number> = {};
      for (const p of Object.keys(scrollDepthAcc)) {
        avgScrollDepth[p] = Math.round(scrollDepthAcc[p].total / scrollDepthAcc[p].count);
      }

      const sessionStats = {
        totalSessions,
        bouncedSessions,
        bounceRate: totalSessions ? Math.round((bouncedSessions / totalSessions) * 1000) / 10 : 0,
        newVisitors,
        returningVisitors,
        avgSessionDurationSec: sessionDurationCount
          ? Math.round(sessionDurationTotal / sessionDurationCount / 1000)
          : 0,
        entryPages,
        exitPages,
        avgTimeOnPage,
        avgScrollDepth
      };

      res.json({
        summary,
        pageViews,
        countries,
        devices,
        deviceVendors,
        browsers,
        operatingSystems,
        referrers,
        sessionStats,
        events
      });
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  // Admin: delete a message
  app.delete("/api/admin/messages/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      await prisma.message.delete({ where: { id } });
      res.json({ success: true });
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  // Multi-page routing
  const pagesDir = path.join(process.cwd(), "pages");

  app.get("/admin", (req, res) => res.sendFile(path.join(pagesDir, "admin.html")));
  app.get("/", (req, res) => res.sendFile(path.join(pagesDir, "index.html")));
  app.get("/services", (req, res) => res.sendFile(path.join(pagesDir, "services.html")));
  app.get("/projects", (req, res) => res.sendFile(path.join(pagesDir, "projects.html")));
  app.get("/experience", (req, res) => res.sendFile(path.join(pagesDir, "experience.html")));
  app.get("/contact", (req, res) => res.sendFile(path.join(pagesDir, "contact.html")));
  app.get("/privacy", (req, res) => {
    const nl = newsletterConfig();
    res.send(fill(fs.readFileSync(path.join(pagesDir, "privacy.html"), "utf8"), {
      NEWSLETTER_PROCESSOR: nl.processor
        ? `Emails are delivered through <strong>${escapeHtml(nl.processor)}</strong>, which acts as a processor on my behalf and receives only your email address and the email content.`
        : "Newsletter delivery is not active yet. Before it starts, the email delivery provider will be named here.",
    }));
  });

  // Insights (monthly newsletter archive) — Markdown in content/insights/
  const readTemplate = (name: string) => fs.readFileSync(path.join(pagesDir, name), "utf8");

  app.get("/insights", (req, res) => {
    const items = loadInsights();
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(fill(readTemplate("insights.html"), {
      LIST: renderListItems(items),
      SUBSCRIBE: newsletterConfig().enabled ? subscribeFormHtml("insights") : "",
      // An empty archive should not be indexed; it starts ranking once issue #1 is live.
      ROBOTS: items.length ? "" : '    <meta name="robots" content="noindex" />\n',
    }));
  });

  app.get("/insights/feed.xml", (req, res) => {
    res.type("application/rss+xml").setHeader("Cache-Control", "public, max-age=3600");
    res.send(renderRss(loadInsights()));
  });

  app.get("/insights/:slug", (req, res, next) => {
    const item = loadInsights().find(i => i.slug === req.params.slug);
    if (!item) return next(); // falls through to the 404 page
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(fill(readTemplate("insight.html"), {
      ...renderArticleValues(item),
      SUBSCRIBE: newsletterConfig().enabled ? subscribeFormHtml(`issue:${item.slug}`, "Get Insights by email") : "",
    }));
  });

  // ── Newsletter: subscribe, confirm, unsubscribe, feedback ──────────────────
  // Plain HTML forms (no JavaScript needed). See lib/newsletter.ts for the
  // privacy model these routes implement.
  const formBody = express.urlencoded({ extended: false, limit: "10kb" });
  const nlPage = (res: any, status: number, values: Record<string, string>) =>
    res.status(status).setHeader("Cache-Control", "no-store").send(fill(readTemplate("newsletter.html"), values));
  const backLink = `<p><a href="/insights" class="text-[var(--color-accent)] hover:opacity-80">← Back to Insights</a></p>`;
  const expiredPage = (res: any) => nlPage(res, 404, messagePage("Link not active", "This link is no longer active",
    `<p>It may have expired or already been used. If you were subscribed through it, you are not receiving emails from it now.</p>${backLink}`));

  const NL_MAX_PER_IP = 5;
  const NL_WINDOW_MS = 15 * 60 * 1000;
  const NL_MAX_CONFIRMS_PER_HOUR = 100; // protects the relay's sending reputation from form abuse
  const nlAttempts = new Map<string, { count: number; firstAttempt: number }>();
  let confirmsThisHour = { count: 0, since: Date.now() };
  setInterval(() => {
    const now = Date.now();
    for (const [ip, e] of nlAttempts) if (now - e.firstAttempt > NL_WINDOW_MS) nlAttempts.delete(ip);
  }, 60 * 60 * 1000).unref();

  // Hourly retention clean-up (and once shortly after start).
  const runPurge = () => purgeExpired(prisma)
    .then(r => { if (r.pending || r.unsubscribed) console.log(`[NEWSLETTER] purged ${r.pending} unconfirmed, ${r.unsubscribed} unsubscribed`); })
    .catch(err => console.warn("[NEWSLETTER] purge failed:", err?.message ?? err));
  setTimeout(runPurge, 30 * 1000).unref();
  setInterval(runPurge, 60 * 60 * 1000).unref();

  app.post("/newsletter/subscribe", formBody, async (req, res) => {
    const cfg = newsletterConfig();
    if (!cfg.enabled) return nlPage(res, 503, messagePage("Not open yet", "Subscriptions aren't open yet", `<p>Please check back soon.</p>${backLink}`));

    const ip = (req.ip || req.socket?.remoteAddress || "unknown").toString();
    const now = Date.now();
    const a = nlAttempts.get(ip);
    if (a && now - a.firstAttempt <= NL_WINDOW_MS) {
      if (a.count >= NL_MAX_PER_IP) {
        res.setHeader("Retry-After", String(Math.ceil((a.firstAttempt + NL_WINDOW_MS - now) / 1000)));
        return nlPage(res, 429, messagePage("Too many attempts", "Too many attempts", `<p>Please wait a few minutes and try again.</p>${backLink}`));
      }
      a.count++;
    } else nlAttempts.set(ip, { count: 1, firstAttempt: now });

    const checkInbox = (email: string) => nlPage(res, 200, messagePage("Check your inbox", "Check your inbox",
      `<p>If <strong>${escapeHtml(email)}</strong> can receive Insights, a confirmation email is on its way. Click the button in it to start your subscription.</p>
       <p class="text-sm text-[var(--color-ink-faint)]">Nothing arrives? Check your spam folder. Unconfirmed addresses are deleted after ${RETENTION.pendingDays} days.</p>${backLink}`));

    // Bots fill the hidden field. Show the normal page and do nothing.
    if (req.body?.website_url) return checkInbox(normaliseEmail(req.body?.email).slice(0, 254));

    const email = normaliseEmail(req.body?.email);
    if (!isValidEmail(email)) {
      return nlPage(res, 400, messagePage("Check the address", "That email address doesn't look right",
        `<p>Please go back and check it.</p>${backLink}`));
    }
    if (req.body?.consent !== "yes") {
      return nlPage(res, 400, messagePage("Consent needed", "Please tick the consent box",
        `<p>I can only send Insights to people who have agreed to receive it.</p>${backLink}`));
    }

    try {
      const result = await subscribe(prisma, email, cleanSource(req.body?.source));
      if (result.action === "confirm-sent") {
        if (now - confirmsThisHour.since > 60 * 60 * 1000) confirmsThisHour = { count: 0, since: now };
        if (confirmsThisHour.count >= NL_MAX_CONFIRMS_PER_HOUR) {
          console.warn("[NEWSLETTER] hourly confirmation cap reached; not sending");
        } else {
          confirmsThisHour.count++;
          await smtpSender(cfg)(confirmEmail(cfg, email, result.subscriber.confirmToken));
        }
      }
      return checkInbox(email);
    } catch (err: any) {
      console.error("[NEWSLETTER] subscribe failed:", err?.message ?? err);
      return nlPage(res, 500, messagePage("Something went wrong", "Something went wrong",
        `<p>Your subscription could not be started. Please try again later.</p>${backLink}`));
    }
  });

  // GET only shows a button: mail scanners that open links must not confirm
  // a subscription on someone's behalf.
  app.get("/newsletter/confirm", (req, res) => {
    const token = req.query.token;
    if (!isToken(token)) return expiredPage(res);
    nlPage(res, 200, messagePage("Confirm subscription", "One last step",
      `<p>Press the button to confirm that you want to receive Insights by email.</p>
       <form method="post" action="/newsletter/confirm?token=${escapeHtml(token)}"><button type="submit" class="nl-button">Confirm subscription</button></form>`));
  });

  app.post("/newsletter/confirm", async (req, res) => {
    const token = req.query.token;
    if (!isToken(token)) return expiredPage(res);
    try {
      const s = await confirmSubscription(prisma, token);
      if (!s) return expiredPage(res);
      if (s !== "already") {
        notifyNewSubscriber(s.email, s.source).catch(() => {});
      }
      return nlPage(res, 200, messagePage("Subscribed", "You're subscribed",
        `<p>Thank you. The next issue of Insights will arrive on the first Tuesday of the month.</p>
         <p class="text-sm text-[var(--color-ink-faint)]">Every email has a one-click unsubscribe link at the bottom.</p>${backLink}`));
    } catch (err: any) {
      console.error("[NEWSLETTER] confirm failed:", err?.message ?? err);
      return nlPage(res, 500, messagePage("Something went wrong", "Something went wrong", `<p>Please try the link again later.</p>`));
    }
  });

  // The link in every email. The page's form submits itself (public/newsletter.js),
  // so a person clicks once; scanners that fetch without running script do nothing.
  app.get("/newsletter/unsubscribe", (req, res) => {
    const token = req.query.token;
    if (!isToken(token)) return expiredPage(res);
    nlPage(res, 200, messagePage("Unsubscribe", "Unsubscribing…",
      `<form method="post" action="/newsletter/unsubscribe?token=${escapeHtml(token)}" data-auto-submit>
         <p>One moment. If nothing happens, press the button.</p>
         <button type="submit" class="nl-button mt-4">Unsubscribe</button>
       </form>`));
  });

  // Handles the page form and RFC 8058 one-click POSTs from mail clients.
  app.post("/newsletter/unsubscribe", formBody, async (req, res) => {
    const token = req.query.token;
    const oneClick = req.body?.["List-Unsubscribe"] === "One-Click";
    if (!isToken(token)) return oneClick ? res.status(404).send("Unknown link") : expiredPage(res);
    try {
      const r = await unsubscribe(prisma, token);
      if (oneClick) return res.status(r ? 200 : 404).type("text/plain").send(r ? "Unsubscribed" : "Unknown link");
      if (!r) return expiredPage(res);
      return nlPage(res, 200, messagePage("Unsubscribed", "You're unsubscribed",
        `<p>You won't receive any more emails from Insights.</p>
         <p class="text-sm text-[var(--color-ink-faint)]">Your address is kept for ${RETENTION.unsubscribedDays} days so a mistaken unsubscribe can be undone, then deleted.</p>
         ${r.wasActive ? feedbackFormHtml(r.feedbackToken, token) : ""}`));
    } catch (err: any) {
      console.error("[NEWSLETTER] unsubscribe failed:", err?.message ?? err);
      if (oneClick) return res.status(500).send("Error");
      return nlPage(res, 500, messagePage("Something went wrong", "Something went wrong",
        `<p>Please try the link again, or reply to any issue and I will remove you by hand.</p>`));
    }
  });

  app.post("/newsletter/resubscribe", async (req, res) => {
    const token = req.query.token;
    if (!isToken(token)) return expiredPage(res);
    const ok = await resubscribe(prisma, token).catch(() => false);
    if (!ok) return expiredPage(res);
    return nlPage(res, 200, messagePage("Subscribed again", "You're subscribed again",
      `<p>No harm done. You'll keep receiving Insights.</p>${backLink}`));
  });

  app.post("/newsletter/feedback", formBody, async (req, res) => {
    const token = req.body?.token;
    if (isToken(token)) await saveFeedback(prisma, token, req.body?.reason, req.body?.comment).catch(() => false);
    return nlPage(res, 200, messagePage("Thank you", "Thank you",
      `<p>Thanks for taking the time. It helps.</p>${backLink}`));
  });

  async function notifyNewSubscriber(email: string, source: string | null) {
    const base = (process.env.NTFY_URL || "").replace(/\/+$/, "");
    const topic = process.env.NTFY_TOPIC || "";
    if (!base || !topic) return;
    const confirmed = await prisma.subscriber.count({ where: { status: "confirmed" } });
    const headers: Record<string, string> = { Title: "New Insights subscriber", Tags: "mailbox_with_mail" };
    if (process.env.NTFY_TOKEN) headers.Authorization = `Bearer ${process.env.NTFY_TOKEN}`;
    await fetch(`${base}/${topic}`, {
      method: "POST", headers,
      body: `${email} confirmed (${source || "insights"}). ${confirmed} confirmed subscribers.`,
      signal: AbortSignal.timeout(8000),
    });
  }

  // ── Newsletter admin ───────────────────────────────────────────────────────
  app.get("/api/admin/newsletter", requireAdmin, async (req, res) => {
    try {
      const cfg = newsletterConfig();
      const [subscribers, feedback, deliveries] = await Promise.all([
        prisma.subscriber.findMany({ orderBy: { requestedAt: "desc" } }),
        prisma.unsubscribeFeedback.findMany({ orderBy: { createdAt: "desc" } }),
        prisma.newsletterDelivery.findMany({ where: { ok: true } }),
      ]);
      const sentBySlug: Record<string, number> = {};
      for (const d of deliveries as any[]) sentBySlug[d.slug] = (sentBySlug[d.slug] || 0) + 1;
      res.json({
        configured: cfg.enabled,
        missing: cfg.missing,
        testTo: cfg.testTo || null,
        consentVersion: CONSENT_VERSION,
        subscribers: (subscribers as any[]).map(s => ({
          id: s.id, email: s.email, status: s.status, source: s.source, consentVersion: s.consentVersion,
          requestedAt: s.requestedAt, confirmedAt: s.confirmedAt, unsubscribedAt: s.unsubscribedAt,
        })),
        feedback: (feedback as any[]).map(f => ({
          createdAt: f.createdAt, reason: f.reason ? FEEDBACK_REASONS[f.reason] || f.reason : null, comment: f.comment,
        })),
        issues: loadInsights().map(i => ({ slug: i.slug, title: i.title, date: i.date, sent: sentBySlug[i.slug] || 0 })),
        job: sendJob,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Erasure on request (GDPR Art. 17). Deliveries cascade.
  app.delete("/api/admin/newsletter/subscribers/:id", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Bad id" });
    try {
      await prisma.subscriber.delete({ where: { id } });
      res.json({ success: true });
    } catch (err: any) {
      res.status(404).json({ error: "Not found" });
    }
  });

  app.post("/api/admin/newsletter/send", requireAdmin, async (req, res) => {
    const cfg = newsletterConfig();
    if (!cfg.enabled) return res.status(400).json({ error: `Sending is not configured. Missing: ${cfg.missing.join(", ")}` });
    const { slug, mode, confirm } = req.body || {};
    const issue = loadInsights().find(i => i.slug === slug);
    if (!issue) return res.status(404).json({ error: "Issue not found or not published yet." });
    if (mode !== "test" && mode !== "all") return res.status(400).json({ error: "mode must be test or all" });
    if (mode === "all" && confirm !== "SEND") return res.status(400).json({ error: 'Type SEND to confirm.' });
    if (sendJob.running) return res.status(409).json({ error: "A send is already running." });
    sendIssue(prisma, cfg, issue, mode, smtpSender(cfg))
      .then(j => console.log(`[NEWSLETTER] ${mode} send of ${slug}: ${j.sent} sent, ${j.failed} failed, ${j.skipped} skipped`))
      .catch(err => console.error(`[NEWSLETTER] send of ${slug} failed:`, err?.message ?? err));
    res.status(202).json({ started: true, job: sendJob });
  });

  // 404 — return a styled page instead of redirecting (redirect hides 404s from search engines)
  app.use((req, res) => {
    res.status(404).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>404 — Page Not Found | Vinamra Kumar</title>
  <meta name="robots" content="noindex">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #050505; color: #e8e8e6; font-family: Inter, system-ui, sans-serif;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      min-height: 100vh; text-align: center; padding: 2rem; gap: 1.5rem;
    }
    .code { font-size: clamp(5rem, 20vw, 9rem); font-weight: 700; letter-spacing: -0.05em; color: #2563eb; line-height: 1; }
    .title { font-size: 1.25rem; font-weight: 500; color: #e8e8e6; }
    .sub { font-size: 0.9rem; color: rgba(232,232,230,0.45); max-width: 36ch; line-height: 1.6; }
    a {
      display: inline-block; margin-top: 0.5rem; padding: 0.65rem 1.75rem;
      background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px;
      font-size: 0.875rem; font-weight: 500; letter-spacing: 0.02em;
      transition: opacity 0.15s;
    }
    a:hover { opacity: 0.85; }
  </style>
</head>
<body>
  <div class="code">404</div>
  <p class="title">Page not found</p>
  <p class="sub">The page you're looking for doesn't exist or has been moved.</p>
  <a href="/">Back to home</a>
</body>
</html>`);
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
