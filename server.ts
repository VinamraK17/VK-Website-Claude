import express from "express";
import path from "path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { google } from "googleapis";
import nodemailer from "nodemailer";

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
  const projectCount = await prisma.project.count();
  if (projectCount === 0) {
    console.log("Seeding initial projects...");
    await prisma.project.createMany({
      data: [
        {
          title: "NEXUS: AI Troubleshooting",
          tag: "Telecom AI",
          stats: "5M+ Users",
          image: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=800",
          description: "Spearheaded the first AI-driven troubleshooting engine for technical support at Sunrise GmbH, significantly reducing support volume.",
          order: 0
        },
        {
          title: "GenAI Strategy & MVP",
          tag: "Digital Transformation",
          stats: "8M+ CHF Saved",
          image: "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&q=80&w=800",
          description: "Orchestrating the GenAI roadmap to automate high-volume customer journeys, defining the convergence of LLMs and business strategy.",
          order: 1
        },
        {
          title: "Lido Aviation DMS",
          tag: "Aviation Software",
          stats: "60% Efficiency",
          image: "https://images.unsplash.com/photo-1559128010-7c1ad6e1b6a5?auto=format&fit=crop&q=80&w=800",
          description: "Led the transformation of legacy flight navigation data management systems into high-efficiency microservices for Lufthansa Systems.",
          order: 2
        }
      ]
    });
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

  app.use(express.json());

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
      const { event, details } = req.body;
      
      await prisma.analytics.create({
        data: {
          event,
          details: JSON.stringify(details || {})
        }
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving analytics:", error);
      res.status(500).json({ success: false });
    }
  });

  // Serve portfolio.html as the main page for all non-API routes
  const portfolioPath = path.join(process.cwd(), "portfolio.html");
  app.get("*", (req, res) => {
    res.sendFile(portfolioPath);
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
