# FocusFuel - Screen Time Rewards

FocusFuel is a gamified screen time tracking application built with Node.js, Express, and SQLite.

## Local Setup

1.  **Install Dependencies**:
    ```bash
    npm install
    ```
2.  **Run the Server**:
    ```bash
    npm start
    ```
3.  **Access the App**:
    Open [http://localhost:3000](http://localhost:3000) in your browser.
    > [!IMPORTANT]
    > Do NOT open `index.html` directly in your browser. The app requires the backend server to handle data and authentication.

## Deployment (Render.com)

1.  **Create a New Web Service** on Render.
2.  **Connect your GitHub Repository**.
3.  **Environment Settings**:
    - **Runtime**: Node
    - **Build Command**: `npm install`
    - **Start Command**: `npm start`
4.  **Disk (Recommended)**:
    Since this app uses SQLite (`focusfuel.db`), you should attach a **Persistent Disk** on Render and point it to the directory where the DB is stored if you want data to persist across deploys.

## Features
- **Custom Authentication**: Local SQLite-based user management.
- **Dynamic Points**: 1pt/min regular, 5pt/min bonus after daily goal.
- **Leaderboard**: Global ranks synced to the backend.
- **PWA Ready**: Can be installed on mobile devices.
