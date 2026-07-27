# 🚀 FlowDesk

> A modern, full-stack internal management platform, designed to streamline workflows, centralize operations, and boost team productivity.

<div align="center">

![TypeScript](https://img.shields.io/badge/TypeScript-97.6%25-3178C6?style=flat-square&logo=typescript&logoColor=white)
![CSS](https://img.shields.io/badge/CSS-2.0%25-264de4?style=flat-square&logo=css3&logoColor=white)
![License](https://img.shields.io/badge/License-Private-red?style=flat-square)
![Status](https://img.shields.io/badge/Status-Active-brightgreen?style=flat-square)

</div>


## 📋 Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Running the App](#running-the-app)
- [Environment Variables](#environment-variables)
- [Contributing](#contributing)
- [License](#license)

---

## 📌 Overview

**FlowDesk** — a full-stack web application that serves as a centralized desk for managing internal operations, team workflows, and day-to-day business processes. Built with TypeScript across both frontend and backend for end-to-end type safety and developer confidence.

---

## 🛠 Tech Stack

<div align="center">

| <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg" width="48" height="48"/><br/>**TypeScript** | <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/react/react-original.svg" width="48" height="48"/><br/>**React** | <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/nodejs/nodejs-original.svg" width="48" height="48"/><br/>**Node.js** | <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/css3/css3-original.svg" width="48" height="48"/><br/>**CSS3** | <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/npm/npm-original-wordmark.svg" width="48" height="48"/><br/>**npm** | <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/git/git-original.svg" width="48" height="48"/><br/>**Git** |
|:---:|:---:|:---:|:---:|:---:|:---:|

</div>

| Layer      | Technology              |
|------------|-------------------------|
| Frontend   | TypeScript, React, CSS  |
| Backend    | TypeScript, Node.js     |
| Runtime    | Node.js                 |
| Language   | TypeScript (97.6%)      |

---

## 📁 Project Structure

```
FlowDesk-Aceone-Internal-software/
├── client/          # Frontend application (React + TypeScript)
│   ├── src/
│   ├── public/
│   └── package.json
├── server/          # Backend API server (Node.js + TypeScript)
│   ├── src/
│   └── package.json
├── tmp/             # Temporary files and assets
└── README.md
```

---

## ⚡ Getting Started

### Prerequisites

Make sure you have the following installed:

- [Node.js](https://nodejs.org/) (v18 or above recommended)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- [Git](https://git-scm.com/)

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/Lakshya52/FlowDesk-Aceone-Internal-software.git
   cd FlowDesk-Aceone-Internal-software
   ```

2. **Install dependencies for the server**

   ```bash
   cd server
   npm install
   ```

3. **Install dependencies for the client**

   ```bash
   cd ../client
   npm install
   ```

### Running the App

**Start the backend server:**

```bash
cd server
npm run dev
```

**Start the frontend client (in a separate terminal):**

```bash
cd client
npm run dev
```

The client will typically be available at `http://localhost:3000` and the server at `http://localhost:5000` (adjust based on your configuration).

---

## 🔐 Environment Variables

Create a `.env` file in both the `client/` and `server/` directories based on their respective `.env.example` files (if provided).

**Server (`server/.env`):**

```env
PORT=5000
DATABASE_URL=your_database_url
JWT_SECRET=your_jwt_secret
NODE_ENV=development
```

**Client (`client/.env`):**

```env
VITE_API_URL=http://localhost:5000
```

---

## 🤝 Contributing

1. Create a new branch: `git checkout -b feature/your-feature-name`
2. Make your changes and commit: `git commit -m "feat: add your feature"`
3. Push to the branch: `git push origin feature/your-feature-name`
4. Open a Pull Request for review

---

## 📄 License

This project is **proprietary and confidential**. Unauthorized use, distribution, or modification is strictly prohibited. All rights reserved.

---
