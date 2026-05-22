# Kushals Electricity Bill Control Dashboard

A comprehensive electricity bill management dashboard for Kushals Jewellery stores across India.

## Features

- **Overview** – State-wise upload compliance & monthly trends
- **Due Date Alerts** – Stores with ≤5 days to due date highlighted
- **Invoice Tracker** – Full store-wise upload & payment status
- **Payment Status** – Paid vs pending by state
- **MoM Comparison** – Month-over-month unit & amount comparison
- **High Bill Analysis** – Per-unit rate analysis to identify overpaying stores
- **🔔 Auto Reminders** – AI-generated WhatsApp & Email reminders via Gmail

## Tech Stack

- React 18 + Vite
- Recharts for data visualization
- Anthropic API for AI-powered reminder messages
- Gmail MCP for email delivery

## Setup

```bash
npm install
npm run dev
```

## Deploy to GitHub Pages

```bash
npm run build
# Push dist/ to gh-pages branch
```
