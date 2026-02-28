document.addEventListener('DOMContentLoaded', () => {
    // ---- State Management ----
    const defaultState = {
        name: '',
        username: '',
        isAuthenticated: false,
        goalMinutes: 180, // 3 hours
        focusMinutes: 0,
        totalPoints: 0,
        currentStreak: 0,
        longestStreak: 0,
        daysMet: 0,
        isWakeLockEnabled: false,
        lastDate: new Date().toDateString(),
        lastHiddenAt: null,
        badges: []
    };

    let state = JSON.parse(localStorage.getItem('focusFuelState')) || defaultState;

    // Migration logic if needed
    state = { ...defaultState, ...state };

    // Badges definitions
    const badgeDefs = [
        { id: 'first_goal', title: 'First Goal Met', icon: 'fa-check-circle' },
        { id: 'streak_3', title: '3-Day Streak', icon: 'fa-fire' },
        { id: 'streak_7', title: '7-Day Streak', icon: 'fa-bolt' },
        { id: 'super_focus', title: 'Super Focus', icon: 'fa-crown' }
    ];

    let currentRegion = 'Global';
    let isRegisterMode = true; // Default to Sign Up

    // ---- DOM Elements ----
    const els = {
        views: document.querySelectorAll('.view'),
        navItems: document.querySelectorAll('.nav-item'),
        headerPoints: document.getElementById('header-points'),
        progressCircle: document.getElementById('progress-circle'),
        timeSpentText: document.getElementById('time-spent'),
        timeGoalText: document.getElementById('time-goal'),
        currentStreak: document.getElementById('current-streak'),
        pointsToday: document.getElementById('points-today'),
        goalHours: document.getElementById('goal-hours'),
        goalMinutes: document.getElementById('goal-minutes'),
        btnSaveGoal: document.getElementById('btn-save-goal'),
        profTotalPoints: document.getElementById('prof-total-points'),
        profLongestStreak: document.getElementById('prof-longest-streak'),
        profDaysMet: document.getElementById('prof-days-met'),
        badgesContainer: document.getElementById('badges-container'),
        toast: document.getElementById('toast'),
        toastTitle: document.getElementById('toast-title'),
        toastMessage: document.getElementById('toast-message'),
        regionTabs: document.getElementById('region-tabs'),
        leaderboardList: document.getElementById('leaderboard-list'),
        // Auth Elements
        authView: document.getElementById('view-auth'),
        authTitle: document.getElementById('auth-title'),
        authSubtitle: document.getElementById('auth-subtitle'),
        authName: document.getElementById('auth-name'),
        authUsername: document.getElementById('auth-username'),
        authEmail: document.getElementById('auth-email'),
        authPassword: document.getElementById('auth-password'),
        authRegion: document.getElementById('auth-region'),
        btnAuthSubmit: document.getElementById('btn-auth-submit'),
        linkToggleAuth: document.getElementById('link-toggle-auth'),
        authToggleText: document.getElementById('auth-toggle-text'),
        nameGroup: document.getElementById('name-group'),
        emailGroup: document.getElementById('email-group'),
        regionGroup: document.getElementById('region-group'),
        // Layout Elements
        mainHeader: document.getElementById('main-header'),
        mainNav: document.getElementById('main-nav'),
        pointsBadge: document.getElementById('main-points-badge'),
        regionTabs: document.getElementById('region-tabs'),
        btnRefreshLeaderboard: document.getElementById('btn-refresh-leaderboard'),
        // Profile Elements
        profDisplayName: document.getElementById('prof-display-name'),
        profDisplayUsername: document.getElementById('prof-display-username'),
        btnLogout: document.getElementById('btn-logout'),
        // Server Status
        statusDot: document.getElementById('status-dot'),
        statusText: document.getElementById('status-text')
    };

    let deferredPrompt;
    let wakeLock = null;

    // ---- Core Functions ----
    function saveState() {
        localStorage.setItem('focusFuelState', JSON.stringify(state));
        updateUI();
    }

    async function checkDayRollover() {
        const today = new Date().toDateString();
        if (state.lastDate !== today) {
            await processEndOfDay();
            state.lastDate = today;
            state.focusMinutes = 0;
            saveState();
            showToast('New Day!', 'Your focus resets. Good luck today!', 'success');
        }
    }

    async function syncUserData() {
        if (!state.username || !state.isAuthenticated) return;

        try {
            const res = await fetch('/api/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: state.username,
                    total_points: state.totalPoints,
                    longest_streak: state.longestStreak,
                    days_met: state.daysMet
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
        } catch (err) {
            console.error('Failed to sync data:', err);
        }
    }

    async function fetchLeaderboard(region = 'Global') {
        if (!els.leaderboardList) return;
        els.leaderboardList.innerHTML = '<div class="loading">Loading leaderboard...</div>';

        try {
            const url = new URL('/api/leaderboard', window.location.origin);
            if (region !== 'Global') url.searchParams.append('region', region);

            const res = await fetch(url);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            renderLeaderboard(data);
        } catch (err) {
            console.error('Failed to fetch leaderboard:', err);
            els.leaderboardList.innerHTML = `<div class="error">Failed to load leaderboard.</div>`;
        }
    }

    function formatTime(minutes) {
        const h = Math.floor(minutes / 60);
        const m = Math.floor(minutes % 60);
        return `${h}h ${m.toString().padStart(2, '0')}m`;
    }

    function updateCircleProgress() {
        const percent = Math.min((state.focusMinutes / state.goalMinutes) * 100, 100);
        const offset = Math.max(283 - (percent / 100) * 283, 0);
        if (els.progressCircle) els.progressCircle.style.strokeDashoffset = offset;
    }

    function awardPoints(minutes) {
        if (!minutes || minutes <= 0) return;

        const prevMins = state.focusMinutes;
        const currentTotalMins = state.focusMinutes + minutes;

        let pointsEarned = 0;

        // Logic: 1pt/min regular, 5pt/min post-goal
        if (prevMins >= state.goalMinutes) {
            // Already past goal, all minutes are bonus
            pointsEarned = Math.floor(minutes * 5);
        } else if (currentTotalMins > state.goalMinutes) {
            // Crossed the goal during this session
            const regularMins = state.goalMinutes - prevMins;
            const bonusMins = currentTotalMins - state.goalMinutes;
            pointsEarned = Math.floor((regularMins * 1) + (bonusMins * 5));
        } else {
            // Still below goal
            pointsEarned = Math.floor(minutes * 1);
        }

        state.focusMinutes = currentTotalMins;
        state.totalPoints += pointsEarned;

        saveState();
        syncUserData();

        const bonusMsg = pointsEarned > minutes ? ' (5x Bonus Points!)' : '';
        showToast('Focus Session', `You earned ${pointsEarned} points${bonusMsg}.`);
    }

    function updateUI() {
        if (!state.isAuthenticated) {
            document.body.classList.add('auth-active');
            els.views.forEach(v => v.classList.remove('active'));
            els.authView.classList.add('active');
            if (els.mainHeader) els.mainHeader.style.display = 'none';
            if (els.mainNav) els.mainNav.style.display = 'none';
            return;
        }

        document.body.classList.remove('auth-active');
        // Show layout elements
        if (els.mainHeader) els.mainHeader.style.display = 'flex';
        if (els.mainNav) els.mainNav.style.display = 'flex';
        els.authView.classList.remove('active');

        // Update Headers
        if (els.headerPoints) els.headerPoints.innerText = state.totalPoints;

        // Dashboard
        if (els.timeSpentText) els.timeSpentText.innerText = formatTime(state.focusMinutes);
        if (els.timeGoalText) els.timeGoalText.innerText = `Goal: ${formatTime(state.goalMinutes)}`;
        if (els.currentStreak) els.currentStreak.innerText = `${state.currentStreak} Days`;
        updateCircleProgress();

        // Profile
        if (els.profDisplayName) els.profDisplayName.innerText = state.name || 'Focus Champion';
        if (els.profDisplayUsername) els.profDisplayUsername.innerText = `@${state.username}`;
        if (els.profTotalPoints) els.profTotalPoints.innerText = state.totalPoints;
        if (els.profLongestStreak) els.profLongestStreak.innerText = `${state.longestStreak} Days`;
        if (els.profDaysMet) els.profDaysMet.innerText = state.daysMet;

        renderBadges();
    }

    function renderLeaderboard(data) {
        if (!els.leaderboardList) return;
        if (data.length === 0) {
            els.leaderboardList.innerHTML = '<div class="empty">No ranks found yet.</div>';
            return;
        }

        els.leaderboardList.innerHTML = data.map((user, index) => {
            const isMe = user.username === state.username;
            return `
                <div class="rank-item ${isMe ? 'is-me' : ''}">
                    <div class="rank-number">${index + 1}</div>
                    <div class="rank-avatar"><i class="fa-solid ${user.avatar || 'fa-user-astronaut'}"></i></div>
                    <div class="rank-info">
                        <span class="rank-name">${isMe ? 'You' : (user.name || user.username)}</span>
                        <span class="rank-pts">${user.total_points} pts</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderBadges() {
        if (!els.badgesContainer) return;
        els.badgesContainer.innerHTML = badgeDefs.map(b => `
            <div class="badge-item ${state.badges.includes(b.id) ? 'unlocked' : ''}">
                <div class="badge-icon"><i class="fa-solid ${b.icon}"></i></div>
                <div class="badge-title">${b.title}</div>
            </div>
        `).join('');
    }

    function showToast(title, message, type = 'success') {
        if (!els.toast) return;
        els.toastTitle.innerText = title;
        els.toastMessage.innerText = message;
        els.toast.className = `toast show ${type}`;
        setTimeout(() => els.toast.classList.remove('show'), 3500);
    }

    // ---- Event Listeners ----

    // Auth Submit
    els.btnAuthSubmit.addEventListener('click', async () => {
        const payload = {
            username: els.authUsername.value.trim(),
            password: els.authPassword.value.trim()
        };

        if (isRegisterMode) {
            payload.name = els.authName.value.trim();
            payload.email = els.authEmail.value.trim();
            payload.region = els.authRegion.value;
            if (!payload.name || !payload.username || !payload.email || !payload.password) {
                return showToast('Error', 'Please fill all fields', 'warning');
            }
        } else {
            if (!payload.username || !payload.password) {
                return showToast('Error', 'Username and password required', 'warning');
            }
        }

        const endpoint = isRegisterMode ? '/api/register' : '/api/login';
        els.btnAuthSubmit.disabled = true;
        els.btnAuthSubmit.innerText = 'Processing...';

        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            let data;
            try {
                data = await res.json();
            } catch (e) {
                throw new Error('Server returned invalid response. Please ensure you are running the server with "npm start" and not opening the file directly.');
            }

            if (!res.ok) throw new Error(data.error || 'Request failed');

            if (isRegisterMode) {
                showToast('Success', 'Account created! Please login.', 'success');
                toggleAuthMode();
            } else {
                state.isAuthenticated = true;
                state.username = data.user.username;
                state.name = data.user.name;
                state.totalPoints = data.user.total_points;
                state.longestStreak = data.user.longest_streak;
                state.daysMet = data.user.days_met;
                saveState();

                // Navigate to dashboard
                document.querySelector('[data-target="view-dashboard"]').click();
                showToast('Welcome back', `Logged in as ${state.name}`, 'success');
            }
        } catch (err) {
            showToast('Auth Error', err.message, 'danger');
        } finally {
            els.btnAuthSubmit.disabled = false;
            els.btnAuthSubmit.innerText = isRegisterMode ? 'Sign Up' : 'Login';
        }
    });

    // Toggle Sign Up / Login
    function toggleAuthMode() {
        isRegisterMode = !isRegisterMode;
        els.authTitle.innerText = isRegisterMode ? 'Welcome' : 'Welcome Back';
        els.authSubtitle.innerText = isRegisterMode ? 'Create an account to start tracking.' : 'Login to sync your focus progress.';
        els.btnAuthSubmit.innerText = isRegisterMode ? 'Sign Up' : 'Login';
        els.authToggleText.innerText = isRegisterMode ? 'Already have an account?' : 'Need an account?';
        els.linkToggleAuth.innerText = isRegisterMode ? 'Login here' : 'Sign up here';
        els.nameGroup.style.display = isRegisterMode ? 'block' : 'none';
        els.emailGroup.style.display = isRegisterMode ? 'block' : 'none';
        els.regionGroup.style.display = isRegisterMode ? 'block' : 'none';
    }

    els.linkToggleAuth.addEventListener('click', (e) => {
        e.preventDefault();
        toggleAuthMode();
    });

    // Navigation
    els.navItems.forEach(item => {
        item.addEventListener('click', () => {
            if (!state.isAuthenticated) return;
            els.navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            const targetId = item.getAttribute('data-target');
            els.views.forEach(v => {
                v.classList.remove('active');
                if (v.id === targetId) v.classList.add('active');
            });

            if (targetId === 'view-leaderboard') fetchLeaderboard(currentRegion);
        });
    });

    // Leaderboard Controls
    if (els.regionTabs) {
        els.regionTabs.addEventListener('click', (e) => {
            if (e.target.classList.contains('tab-btn')) {
                els.regionTabs.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                currentRegion = e.target.getAttribute('data-region');
                fetchLeaderboard(currentRegion);
            }
        });
    }

    if (els.btnRefreshLeaderboard) {
        els.btnRefreshLeaderboard.addEventListener('click', () => {
            fetchLeaderboard(currentRegion);
        });
    }

    // Focus Tracking
    document.addEventListener('visibilitychange', () => {
        if (!state.isAuthenticated) return;

        if (document.hidden) {
            state.lastHiddenAt = Date.now();
            saveState();
        } else {
            if (state.lastHiddenAt) {
                const elapsedMs = Date.now() - state.lastHiddenAt;
                const elapsedMins = elapsedMs / (1000 * 60);
                if (elapsedMins > 0.1) { // Min 6 seconds to count
                    awardPoints(elapsedMins);
                }
                state.lastHiddenAt = null;
                checkDayRollover();
                saveState();
            }
        }
    });

    // Logout
    if (els.btnLogout) {
        els.btnLogout.addEventListener('click', () => {
            state = { ...defaultState };
            localStorage.removeItem('focusFuelState');
            location.reload();
        });
    }

    // Save Goal
    if (els.btnSaveGoal) {
        els.btnSaveGoal.addEventListener('click', () => {
            const h = parseInt(els.goalHours.value) || 0;
            const m = parseInt(els.goalMinutes.value) || 0;
            state.goalMinutes = (h * 60) + m;
            saveState();
            showToast('Goal Updated', `Target: ${formatTime(state.goalMinutes)}`, 'success');
        });
    }

    async function processEndOfDay() {
        if (state.focusMinutes >= state.goalMinutes) {
            state.currentStreak++;
            state.daysMet++;
            if (state.currentStreak > state.longestStreak) state.longestStreak = state.currentStreak;
        } else {
            state.currentStreak = 0;
        }
        await syncUserData();
    }

    async function checkServerConnection() {
        if (!els.statusDot) return;

        try {
            const res = await fetch('/api/status');
            if (res.ok) {
                els.statusDot.className = 'status-dot online';
                els.statusText.innerText = 'Connected to FocusFuel Server';
            } else {
                throw new Error();
            }
        } catch (e) {
            els.statusDot.className = 'status-dot offline';
            els.statusText.innerText = 'Server offline - Run "npm start"';
        }
    }

    // Init
    function init() {
        checkServerConnection();
        if (state.isAuthenticated) {
            // Restore from background if refreshed
            if (state.lastHiddenAt) {
                const elapsedMs = Date.now() - state.lastHiddenAt;
                awardPoints(elapsedMs / (1000 * 60));
                state.lastHiddenAt = null;
                saveState();
            }
            // Ensure first view is dashboard
            const dashboardTab = document.querySelector('[data-target="view-dashboard"]');
            if (dashboardTab) dashboardTab.click();
        }
        updateUI();
    }

    init();
});
