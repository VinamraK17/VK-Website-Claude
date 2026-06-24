import express from "express";
import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { google } from "googleapis";
import nodemailer from "nodemailer";
import { UAParser } from "ua-parser-js";

dotenv.config();

// Prisma Setup (MariaDB on NAS)
const dbUrl = process.env.DATABASE_URL || "mysql://user:password@localhost:3306/portfolio";
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

// Gmail & SMTP Helper (Robust / NAS Compatible)
async function sendEmail(name: string, email: string, message: string) {
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeMessage = escapeHtml(message);
  const targetEmail = "contact@vinamrakumar.com";
  const subject = `Portfolio Contact from ${name}`;

  // 1. SMTP (Robust & NAS Friendly)
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || "465"),
        secure: process.env.SMTP_PORT === "465",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from: `"${safeName}" <${process.env.SMTP_USER}>`,
        to: targetEmail,
        replyTo: email,
        subject: subject,
        html: `
          <h3>New contact request</h3>
          <p><strong>From:</strong> ${safeName} (${safeEmail})</p>
          <p><strong>Message:</strong></p>
          <p style="white-space: pre-wrap;">${safeMessage}</p>
          <br/><hr/>
          <p><small>Sent via Nodemailer (Self-Hosted MariaDB/NAS)</small></p>
        `,
      });
      console.log("Email sent via SMTP.");
      return;
    } catch (smtpErr) {
      console.error("SMTP failed, attempting Google fallback:", smtpErr);
    }
  }

  // 2. Google APIs Fallback
  try {
    const auth = new google.auth.GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/gmail.send"],
    });
    const authClient = await auth.getClient() as any;
    const gmail = google.gmail({ version: "v1", auth: authClient });

    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString("base64")}?=`;
    
    const emailLines = [
      `To: ${targetEmail}`,
      "Content-Type: text/html; charset=utf-8",
      "MIME-Version: 1.0",
      `Subject: ${utf8Subject}`,
      "",
      `<h3>New contact request</h3>`,
      `<p><strong>From:</strong> ${safeName} (${safeEmail})</p>`,
      `<p><strong>Message:</strong></p>`,
      `<p style="white-space: pre-wrap;">${safeMessage}</p>`,
      "<br/>",
      "<hr/>",
      "<p><small>Sent via Google Workspace Integration (Prisma/MariaDB Port)</small></p>"
    ];

    const raw = Buffer.from(emailLines.join("\r\n"))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });
    console.log("Gmail notification sent.");
  } catch (error) {
    console.error("Gmail notification failed:", error);
  }
}

async function seedData() {
  const projectsToSeed = [
    {
      title: "NEXUS: AI Troubleshooting",
      tag: "Telecom AI",
      stats: "5M+ Users",
      image: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=800",
      description: "Architected and launched NEXUS — an LLM-powered troubleshooting platform serving 5M+ customers at Sunrise GmbH, driving significant call deflection and operational savings.",
      order: 0
    },
    {
      title: "GenAI Strategy & MVP",
      tag: "Digital Transformation",
      stats: "8M+ CHF Saved",
      image: "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&q=80&w=800",
      description: "Defined and delivered the enterprise GenAI roadmap for a CHF 1B+ telco, automating customer care journeys and driving 8M+ CHF in annual efficiency savings.",
      order: 1
    },
    {
      title: "Aviation IT Portfolio Modernisation",
      tag: "Aviation Software",
      stats: "60% Efficiency Gain",
      image: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&q=80&w=800",
      description: "Modernised a fragmented 77-application aviation IT portfolio at Lufthansa Systems — introducing Agile SCRUM, governance frameworks, and roadmap alignment to unlock 40%+ in budget savings.",
      order: 2
    },
    {
      title: "Data-Driven Aviation Maps",
      tag: "Aviation Software",
      stats: "Zero-to-Production",
      image: "https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&q=80&w=800",
      description: "Led the end-to-end program to replace manual static aviation chart production with a dynamic, data-driven generation platform — EASA and ICAO certified.",
      order: 3
    },
    {
      title: "Leadership Across Aviation & Telecoms",
      tag: "Strategy & Leadership",
      stats: "15+ Years | 2 Industries",
      image: "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&q=80&w=800",
      description: "A two-decade leadership track across aviation and telecoms — from multicultural 19-FTE operations teams to C-suite GenAI strategy at a CHF 1B+ telco.",
      order: 4
    }
  ];

  const projectCount = await prisma.project.count();
  const expectedTitles = projectsToSeed.map(p => p.title);
  const existingProjects = await prisma.project.findMany({ select: { title: true } });
  const existingTitles = existingProjects.map(p => p.title);
  const needsReseed = projectCount !== projectsToSeed.length || !expectedTitles.every(t => existingTitles.includes(t));

  if (needsReseed) {
    console.log("Updating projects to latest version...");
    await prisma.project.deleteMany();
    await prisma.project.createMany({ data: projectsToSeed });
  }

  const expCount = await prisma.experience.count();
  if (expCount === 0) {
    console.log("Seeding full experience history...");

    await prisma.experience.create({
      data: {
        company: "Sunrise GmbH",
        role: "Manager Digital Transformation",
        period: "Feb 2024 – Present",
        location: "Zurich, Switzerland",
        description: "Owning the digital product strategy for a CHF 1B+ telco, aligning 5+ cross-functional teams around a unified transformation roadmap that accelerated time-to-market across the entire portfolio.",
        achievements: [
          "Digital Leadership: Managed a multi-million franc digital product portfolio, embedding OKR and KPI frameworks that connected product delivery directly to business revenue targets.",
          "Strategic Alignment: Built and governed an ecosystem of external partners and vendors, ensuring delivery quality, cost discipline, and strategic alignment across the full product development lifecycle.",
          "Market Competitive Positioning: Led ongoing market and trend analysis, enabling the business to identify and act on digital opportunities ahead of competitors.",
          "Financial Performance: Secured 8M+ CHF in annual efficiency savings through strategic GenAI integrations and process automation."
        ],
        order: 0
      }
    });

    await prisma.experience.create({
      data: {
        company: "Sunrise GmbH",
        role: "Product Owner Digital Transformation",
        period: "Sep 2022 – Feb 2024",
        location: "Zürich Metropolitan Area",
        description: "Architected and shipped NEXUS — an LLM-powered AI troubleshooting platform serving 5M+ customers — leading a cross-functional team of 9 from zero to full production, reducing inbound tech support call volumes.",
        achievements: [
          "NEXUS Platform Architecture: Designed the end-to-end system architecture, making core infrastructure decisions on AI model integration, scalability, and platform resilience for millions of concurrent users.",
          "Cost Optimization: Exceeded departmental cost targets by 20% in 2023 by redesigning team operating models around the customer journey.",
          "Agile Delivery: Surpassed all departmental KPIs by 20% by owning product delivery end-to-end — from vision and business case through to launch and iteration.",
          "Team Development: Led People Development for a core agile team of 15+ engineers and designers."
        ],
        order: 1
      }
    });

    await prisma.experience.create({
      data: {
        company: "Lufthansa Systems",
        role: "Product Owner",
        period: "Mar 2018 – Aug 2022",
        location: "Zurich, Switzerland (Hybrid)",
        description: "Modernized a mission-critical internal application portfolio of 77 tools — leading a cross-functional team of 8 and driving a 60% increase in operational efficiency across international operations in Zurich and Gdansk.",
        achievements: [
          "Operational Savings: Delivered 40%+ savings against budget by replacing legacy workflows with agile, automation-first practices.",
          "Risk & Compliance Management: Ensured zero critical compliance gaps across all 77 aviation applications by building and maintaining a live risk register meeting stringent international aeronautical regulatory standards.",
          "Global Team Alignment: Unified stakeholder alignment across two international locations, eliminating release delays through structured backlog management."
        ],
        order: 2
      }
    });

    await prisma.experience.create({
      data: {
        company: "Lufthansa Systems",
        role: "Production Manager Data Driven Maps Program Lido/Navigation",
        period: "Feb 2016 – Feb 2018",
        location: "Zurich, Switzerland",
        description: "Launched a first-of-its-kind production process for the Data Driven Maps Program from zero to full implementation — defining quality standards, securing regulatory certifications, and scaling operations on time.",
        achievements: [
          "Procurement Cost Optimization: Reduced procurement costs by conducting rigorous make-or-buy analyses, selecting the optimal mix of external partners and internal capabilities.",
          "Skill Development & Capacity Building: Future-proofed the team by identifying critical skill gaps and building targeted training plans.",
          "Risk Mitigation: Mitigated program delivery risk by designing a robust transition plan that bridged current operations with future objectives."
        ],
        order: 3
      }
    });

    await prisma.experience.create({
      data: {
        company: "Lufthansa Systems",
        role: "Manager Production Lido/Navigation",
        period: "May 2012 – Mar 2016",
        location: "Zurich, Switzerland",
        description: "Led a multicultural production team of 19 FTE, managing the full AIRAC cycle — ensuring on-time, compliant delivery of aeronautical products to airline customers across international markets.",
        achievements: [
          "People Development: Drove team performance and retention by owning hiring, compensation decisions, and onboarding.",
          "Process Optimization: Improved cross-site coordination between Zurich and Gdansk by restructuring communication and process workflows, eliminating delays."
        ],
        order: 4
      }
    });

    await prisma.experience.create({
      data: {
        company: "Lufthansa Systems",
        role: "Quality Assurance / Aeronautical Chart Specialist",
        period: "May 2009 – May 2012",
        location: "Zurich, Switzerland",
        description: "Maintained zero-defect delivery of aeronautical charts to airline customers by ensuring full compliance with international safety and quality standards across every AIRAC cycle.",
        achievements: [
          "Mentorship: Accelerated team capability by mentoring and training new hires, reducing onboarding time.",
          "Quality Controls: Led the testing and evaluation of new tools before production integration, protecting operational continuity."
        ],
        order: 5
      }
    });

    await prisma.experience.create({
      data: {
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
      }
    });
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
        "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://unpkg.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.tailwindcss.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: https:",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
      ].join("; ")
    );
    // Keep the admin dashboard out of search engines/caches.
    if (req.path.startsWith("/admin") || req.path.startsWith("/api/admin")) {
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      res.setHeader("Cache-Control", "no-store");
    }
    next();
  });

  // Serve static assets (images, robots.txt, sitemap, etc.) from /public
  app.use(express.static(path.join(process.cwd(), 'public')));

  // Try to seed data (ignore if fails during build/env issues)
  seedData().catch(err => console.warn("Seed failed (ignorable if DB not ready):", err.message));

  // Contact Form Endpoint
  app.post("/api/contact", async (req, res) => {
    try {
      const { name, email, message } = req.body;
      
      if (!name || !email || !message) {
        return res.status(400).json({ success: false, error: "Name, email, and message are required to reveal the personal email." });
      }

      console.log(`[CONTACT] Message from ${name} <${email}>`);

      // Store in MariaDB via Prisma
      await prisma.message.create({
        data: {
          name,
          email,
          message
        }
      });

      // Email Notification - NON-BLOCKING
      sendEmail(name, email, message);
      
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
      res.json(experiences);
    } catch (error) {
      console.error("Error fetching experiences:", error);
      res.status(500).json({ error: "Failed to fetch experiences" });
    }
  });

  // DB Status Endpoint for NAS/Self-hosting verification
  app.get("/api/db-status", async (req, res) => {
    try {
      await prisma.$connect();
      res.json({ 
        connected: true,
        type: "MariaDB/Prisma",
        persistence: "MariaDB (Docker on Synology)",
        status: "active"
      });
    } catch (err) {
      res.json({ 
        connected: false,
        type: "MariaDB/Prisma",
        persistence: "Connection Failed",
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

  const legacyPath = path.join(process.cwd(), "portfolio.html");
  app.get("/legacy", (req, res) => res.sendFile(legacyPath));

  // Catch-all: redirect unknown routes to home
  app.get("*", (req, res) => res.redirect("/"));

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
