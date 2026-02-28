document.addEventListener('DOMContentLoaded', () => {
    // ---- State Management ----
    const API_BASE_URL = window.location.origin + '/api';


    const defaultState = {
        username: '',
        region: 'Global',
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

    // Migration: Ensure new fields exist and old ones are converted
    if (state.currentUsageMinutes !== undefined) {
        state.focusMinutes = state.currentUsageMinutes;
        delete state.currentUsageMinutes;
    }
    state = { ...defaultState, ...state };

    // Badges definitions
    const badgeDefs = [
        { id: 'first_goal', title: 'First Goal Met', icon: 'fa-check-circle' },
        { id: 'streak_3', title: '3-Day Streak', icon: 'fa-fire' },
        { id: 'streak_7', title: '7-Day Streak', icon: 'fa-bolt' },
        { id: 'super_focus', title: 'Super Focus', icon: 'fa-crown' }
    ];

    let currentRegion = 'Global';

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
        // Profile Elements
        userNameInput: document.getElementById('user-name-input'),
        userRegionSelect: document.getElementById('user-region-select'),
        btnSaveProfile: document.getElementById('btn-save-profile'),
        // Tracking Elements
        trackingStatus: document.getElementById('tracking-status'),
        // Auth Elements
        authView: document.getElementById('view-auth'),
        authForm: document.getElementById('auth-form'),
        authTitle: document.getElementById('auth-title'),
        authSubtitle: document.getElementById('auth-subtitle'),
        authUsername: document.getElementById('auth-username'),
        authPassword: document.getElementById('auth-password'),
        authRegion: document.getElementById('auth-region'),
        regionGroup: document.getElementById('region-group'),
        btnAuthSubmit: document.getElementById('btn-auth-submit'),
        authToggleLink: document.getElementById('auth-toggle-link'),
        authToggleText: document.getElementById('auth-toggle-text'),
        btnLogout: document.getElementById('btn-logout'),
        btnInstallPWA: document.getElementById('btn-install-pwa'),
        toggleWakeLock: document.getElementById('toggle-wake-lock'),
        bottomNav: document.querySelector('.bottom-nav'),
    };

    let isRegisterMode = false;
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
            const response = await fetch(`${API_BASE_URL}/users/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: state.username,
                    points: state.totalPoints,
                    longestStreak: state.longestStreak,
                    daysMet: state.daysMet,
                    avatar: 'fa-user-astronaut'
                })
            });
            const data = await response.json();
            console.log('Sync result:', data);
        } catch (err) {
            console.error('Failed to sync data:', err);
        }
    }

    async function fetchLeaderboard(region) {
        if (!els.leaderboardList) return;

        els.leaderboardList.innerHTML = '<div class="loading">Loading leaderboard...</div>';

        try {
            const response = await fetch(`${API_BASE_URL}/leaderboard?region=${region}`);
            const data = await response.json();
            renderLeaderboard(data.leaderboard);
        } catch (err) {
            console.error('Failed to fetch leaderboard:', err);
            els.leaderboardList.innerHTML = '<div class="error">Failed to load leaderboard.</div>';
        }
    }

    function formatTime(minutes) {
        const h = Math.floor(minutes / 60);
        const m = Math.floor(minutes % 60);
        return `${h}h ${m.toString().padStart(2, '0')}m`;
    }

    // Update the circular progress bar
    function updateProgress() {
        const percent = Math.min((state.focusMinutes / state.goalMinutes) * 100, 100);
        // Circle circumference is 283
        const offset = Math.max(283 - (percent / 100) * 283, 0);
        els.progressCircle.style.strokeDashoffset = offset;

        if (percent >= 100) {
            els.progressCircle.style.stroke = 'var(--primary-color)';
        } else if (percent >= 50) {
            els.progressCircle.style.stroke = 'var(--secondary-color)';
        } else {
            els.progressCircle.style.stroke = 'var(--warning-color)';
        }
    }

    function updateUI() {
        if (!state.isAuthenticated) {
            els.views.forEach(v => v.classList.remove('active'));
            els.authView.classList.add('active');
            els.bottomNav.style.display = 'none';
            return;
        }

        els.authView.classList.remove('active');
        els.bottomNav.style.display = 'flex';

        // Headers
        els.headerPoints.innerText = state.totalPoints;

        // Dashboard
        els.timeSpentText.innerText = formatTime(state.focusMinutes);
        els.timeGoalText.innerText = `Goal: ${formatTime(state.goalMinutes)}`;
        els.currentStreak.innerText = `${state.currentStreak} Days`;
        updateProgress();

        // Goals input
        els.goalHours.value = Math.floor(state.goalMinutes / 60);
        els.goalMinutes.value = state.goalMinutes % 60;

        // Profile
        els.profTotalPoints.innerText = state.totalPoints;
        els.profLongestStreak.innerText = `${state.longestStreak} Days`;
        els.profDaysMet.innerText = state.daysMet;

        // Profile Inputs
        if (els.userNameInput) els.userNameInput.value = state.username || '';
        if (els.userRegionSelect) els.userRegionSelect.value = state.region || 'Global';

        // Tracking Status
        if (els.trackingStatus) {
            els.trackingStatus.innerText = document.hidden ? 'Focusing...' : 'Ready to Focus';
        }

        renderBadges();
    }

    function renderLeaderboard(leaderboardData) {
        if (!els.leaderboardList) return;

        const list = leaderboardData || [];

        if (list.length === 0) {
            els.leaderboardList.innerHTML = '<div class="empty">No entries in this region yet.</div>';
            return;
        }

        els.leaderboardList.innerHTML = list.map((user, index) => {
            const isMe = user.username === state.username;
            return `
                <div class="rank-item ${isMe ? 'is-me' : ''}">
                    <div class="rank-number">${index + 1}</div>
                    <div class="rank-avatar"><i class="fa-solid ${user.avatar || 'fa-user-astronaut'}"></i></div>
                    <div class="rank-info">
                        <span class="rank-name">${user.username === state.username ? 'You' : user.username}</span>
                        <span class="rank-pts">${user.total_points} pts</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderBadges() {
        els.badgesContainer.innerHTML = badgeDefs.map(b => `
            <div class="badge-item ${state.badges.includes(b.id) ? 'unlocked' : ''}">
                <div class="badge-icon"><i class="fa-solid ${b.icon}"></i></div>
                <div class="badge-title">${b.title}</div>
            </div>
        `).join('');
    }

    function showToast(title, message, type = 'success') {
        els.toastTitle.innerText = title;
        els.toastMessage.innerText = message;

        const icon = els.toast.querySelector('.toast-icon');
        icon.style.background = type === 'success' ? 'var(--primary-color)' :
            (type === 'warning' ? 'var(--warning-color)' : 'var(--danger-color)');
        icon.innerHTML = type === 'success' ? '<i class="fa-solid fa-check"></i>' :
            (type === 'warning' ? '<i class="fa-solid fa-exclamation"></i>' : '<i class="fa-solid fa-xmark"></i>');

        els.toast.classList.add('show');
        setTimeout(() => els.toast.classList.remove('show'), 3500);
    }

    function triggerPointsBump() {
        const badge = document.querySelector('.points-badge');
        badge.classList.add('bump');
        setTimeout(() => badge.classList.remove('bump'), 300);
    }

    function checkBadges() {
        if (state.daysMet >= 1 && !state.badges.includes('first_goal')) state.badges.push('first_goal');
        if (state.longestStreak >= 3 && !state.badges.includes('streak_3')) state.badges.push('streak_3');
        if (state.longestStreak >= 7 && !state.badges.includes('streak_7')) state.badges.push('streak_7');
    }

    // ---- Event Listeners ----

    // Automatic Focus Tracking logic
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            state.lastHiddenAt = Date.now();
        } else {
            let elapsedMins = 0;
            if (state.lastHiddenAt) {
                const elapsedMs = Date.now() - state.lastHiddenAt;
                elapsedMins = elapsedMs / (1000 * 60);

                updateProgress(elapsedMins);
                state.lastHiddenAt = null;

                checkDayRollover();
                saveState();
            }
            if (elapsedMins >= 1) {
                showToast('Focus Session Ended', `You earned ${Math.floor(elapsedMins)} mins of focus time.`);
            }
            // Resume wake lock if tab becomes visible again
            requestWakeLock();
        }
    });

    // Auth Event Listeners
    if (els.authToggleLink) {
        els.authToggleLink.addEventListener('click', (e) => {
            e.preventDefault();
            isRegisterMode = !isRegisterMode;
            els.authTitle.innerText = isRegisterMode ? 'Create Account' : 'Welcome Back';
            els.authSubtitle.innerText = isRegisterMode ? 'Join FocusFuel to start tracking.' : 'Login to sync your focus progress.';
            els.btnAuthSubmit.innerText = isRegisterMode ? 'Register' : 'Login';
            els.authToggleText.innerText = isRegisterMode ? 'Already have an account?' : "Don't have an account?";
            els.authToggleLink.innerText = isRegisterMode ? 'Login Now' : 'Register Now';
            els.regionGroup.style.display = isRegisterMode ? 'block' : 'none';
        });
    }

    if (els.authForm) {
        els.authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = els.authUsername.value.trim();
            const password = els.authPassword.value;
            const region = els.authRegion.value;

            const endpoint = isRegisterMode ? '/auth/register' : '/auth/login';
            const body = isRegisterMode ? { username, password, region } : { username, password };

            try {
                const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const data = await response.json();

                if (response.ok) {
                    if (isRegisterMode) {
                        showToast('Success', 'Account created! Please login.', 'success');
                        isRegisterMode = false;
                        els.authToggleLink.click();
                    } else {
                        state.username = data.user.username;
                        state.region = data.user.region;
                        state.totalPoints = data.user.total_points;
                        state.longestStreak = data.user.longest_streak;
                        state.daysMet = data.user.days_met;
                        state.isAuthenticated = true;
                        saveState();
                        showToast('Welcome', `Glad to see you, ${state.username}!`);
                        // Switch to dashboard
                        document.querySelector('[data-target="view-dashboard"]').click();
                    }
                } else {
                    showToast('Auth Error', data.error || 'Something went wrong', 'danger');
                }
            } catch (err) {
                console.error('Auth request failed:', err);
                showToast('Error', 'Server connection failed', 'danger');
            }
        });
    }

    if (els.btnLogout) {
        els.btnLogout.addEventListener('click', () => {
            state.isAuthenticated = false;
            state.username = '';
            // We keep goal settings and local points just in case, but primary data is in DB
            saveState();
            location.reload(); // Hard reset for safety
        });
    }

    // Navigation
    els.navItems.forEach(item => {
        item.addEventListener('click', () => {
            if (!state.isAuthenticated) return;
            const currentItem = Array.from(els.navItems).find(n => n.classList.contains('active'));
            if (currentItem) currentItem.classList.remove('active');
            item.classList.add('active');

            const targetId = item.getAttribute('data-target');
            els.views.forEach(v => {
                v.classList.remove('active');
                if (v.id === targetId) v.classList.add('active');
            });

            if (targetId === 'view-leaderboard') {
                fetchLeaderboard(currentRegion);
            }
        });
    });

    // Region Tabs
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

    // Save Goal
    els.btnSaveGoal.addEventListener('click', () => {
        const h = parseInt(els.goalHours.value) || 0;
        const m = parseInt(els.goalMinutes.value) || 0;

        // Enforce 2h min and 23h 59m max
        const totalMin = (h * 60) + m;
        if (totalMin < 120) {
            showToast('Invalid Goal', 'Minimum daily goal is 2 hours', 'danger');
            return;
        }
        if (h > 23 || (h === 23 && m > 59)) {
            showToast('Invalid Goal', 'Maximum daily goal is 23h 59m', 'danger');
            return;
        }

        state.goalMinutes = totalMin;
        saveState();
        showToast('Goal Updated', `Your daily focus target is now ${formatTime(state.goalMinutes)}.`);
    });

    // Save Profile
    if (els.btnSaveProfile) {
        els.btnSaveProfile.addEventListener('click', async () => {
            const newName = els.userNameInput.value.trim();
            const newRegion = els.userRegionSelect.value;

            if (!newName) {
                showToast('Error', 'Please enter a username', 'danger');
                return;
            }

            state.username = newName;
            state.region = newRegion;
            saveState();
            await syncUserData();
            showToast('Profile Saved', 'Your identity has been updated and synced.');
        });
    }

    // Process Gamification at End of Day (Automatic)
    async function processEndOfDay() {
        let earnedPoints = 0;
        let diff = state.focusMinutes - state.goalMinutes;
        let message = '';
        let type = 'success';

        els.pointsToday.innerText = `+0`;

        if (state.focusMinutes >= state.goalMinutes) {
            // Success! Met goal
            state.currentStreak++;
            state.daysMet++;

            if (state.currentStreak > state.longestStreak) {
                state.longestStreak = state.currentStreak;
            }

            earnedPoints += 10; // Base points
            message = 'Daily goal met! +10 pts.';

            // Bonus points for overachieving (30+ mins over)
            if (diff >= 30) {
                earnedPoints += 5;
                message += ' +5 bonus pts for deep focus!';
                if (!state.badges.includes('super_focus')) state.badges.push('super_focus');
            }

            // Streak Milestones
            if (state.currentStreak === 3) {
                earnedPoints += 20;
                message += ' +20 pts (3-day streak!)';
            } else if (state.currentStreak === 7) {
                earnedPoints += 50;
                message += ' +50 pts (7-day streak!)';
            } else if (state.currentStreak === 30) {
                earnedPoints += 200;
                message += ' +200 pts (30-day streak!)';
            }

        } else if (state.focusMinutes >= state.goalMinutes - 5) {
            // Grace Buffer (within 5 mins of goal)
            message = 'Goal missed slightly. Streak saved by grace buffer. 0 pts.';
            type = 'warning';
        } else {
            // Failure
            state.currentStreak = 0;
            message = 'Focus goal missed. Streak reset.';
            type = 'danger';
        }

        // Apply
        if (earnedPoints > 0) {
            state.totalPoints += earnedPoints;
            els.pointsToday.innerText = `+${earnedPoints}`;
            triggerPointsBump();
        }

        checkBadges();

        await syncUserData();
        console.log('Processed End of Day:', message);
        showToast('Day Ended', message, type);
    }

    // Initialization
    function init() {
        checkDayRollover();

        // Recovery: If we were hidden when last saved (e.g. refresh during focus)
        if (state.lastHiddenAt) {
            const elapsedMs = Date.now() - state.lastHiddenAt;
            const elapsedMins = elapsedMs / (1000 * 60);
            if (elapsedMins > 0) {
                console.log(`Recovered ${elapsedMins.toFixed(2)} mins of focus.`);
                updateProgress(elapsedMins);
                state.lastHiddenAt = null;
                saveState();
            }
        }

        updateUI();
        requestWakeLock();
    }

    // Wake Lock Logic
    async function requestWakeLock() {
        if (!state.isWakeLockEnabled || !('wakeLock' in navigator)) return;
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Wake Lock is active');
            wakeLock.addEventListener('release', () => {
                console.log('Wake Lock was released');
            });
        } catch (err) {
            console.error(`${err.name}, ${err.message}`);
        }
    }

    if (els.toggleWakeLock) {
        els.toggleWakeLock.checked = state.isWakeLockEnabled;
        els.toggleWakeLock.addEventListener('change', (e) => {
            state.isWakeLockEnabled = e.target.checked;
            saveState();
            if (state.isWakeLockEnabled) {
                requestWakeLock();
            } else if (wakeLock) {
                wakeLock.release();
                wakeLock = null;
            }
        });
    }

    // PWA Install Logic
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        if (els.btnInstallPWA) {
            els.btnInstallPWA.style.display = 'block';
        }
    });

    if (els.btnInstallPWA) {
        els.btnInstallPWA.addEventListener('click', async () => {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`User response to the install prompt: ${outcome}`);
            deferredPrompt = null;
            els.btnInstallPWA.style.display = 'none';
        });
    }

    window.addEventListener('appinstalled', () => {
        console.log('PWA was installed');
        if (els.btnInstallPWA) {
            els.btnInstallPWA.style.display = 'none';
        }
    });

    // Service Worker Registration for PWA
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/service-worker.js')
                .then(reg => console.log('Service Worker registered', reg))
                .catch(err => console.error('Service Worker registration failed', err));
        });
    }

    init();
});
