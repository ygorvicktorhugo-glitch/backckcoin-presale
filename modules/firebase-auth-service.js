// modules/firebase-auth-service.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, collection, getDocs, updateDoc, deleteDoc, query, where, increment, orderBy, limit, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// ... (Configuração Firebase como antes) ...
const firebaseConfig = {
  apiKey: "AIzaSyDKhF2_--fKtot96YPS8twuD0UoCpS-3T4", // SUBSTITUA PELAS SUAS CREDENCIAIS REAIS
  authDomain: "airdropbackchainnew.firebaseapp.com",
  projectId: "airdropbackchainnew",
  storageBucket: "airdropbackchainnew.firebasestorage.app",
  messagingSenderId: "108371799661",
  appId: "1:108371799661:web:d126fcbd0ba56263561964",
  measurementId: "G-QD9EBZ0Y09"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;

// =======================================================
//  FUNÇÕES DE AUTENTICAÇÃO
// =======================================================
export async function signIn(walletAddress) {
    if (!walletAddress) throw new Error("Wallet address is required for Firebase sign-in.");

    if (currentUser) {
        await getAirdropUser(walletAddress);
        return currentUser;
    }

    return new Promise((resolve, reject) => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                currentUser = user;
                await getAirdropUser(walletAddress);
                unsubscribe();
                resolve(user);
            } else {
                 signInAnonymously(auth).catch((error) => {
                    console.error("Anonymous sign-in failed:", error);
                    unsubscribe();
                    reject(error);
                });
            }
        }, (error) => {
             console.error("Auth state change error:", error);
             unsubscribe();
             reject(error);
        });

        if (auth.currentUser) {
             currentUser = auth.currentUser;
             getAirdropUser(walletAddress).then(resolve).catch(reject);
             unsubscribe();
        }
    });
}

function ensureAuthenticated() {
    if (!currentUser) {
        throw new Error("User not authenticated. Please connect wallet and sign in first.");
    }
}


// =======================================================
//  FUNÇÕES DE DADOS PÚBLICOS (COM CORREÇÃO)
// =======================================================
export async function getPublicAirdropData() {
    const dataRef = doc(db, "airdrop_public_data", "data_v1");
    const dataSnap = await getDoc(dataRef);

    if (dataSnap.exists()) {
        const data = dataSnap.data();

        // 1. Converte Timestamps para objetos Date (Isto está correto)
        const tasks = (data.dailyTasks || []).map(task => ({
            ...task,
            id: task.id || null,
            startDate: task.startDate?.toDate ? task.startDate.toDate() : (task.startDate ? new Date(task.startDate) : null),
            endDate: task.endDate?.toDate ? task.endDate.toDate() : (task.endDate ? new Date(task.endDate) : null),
        }));

        const now = Date.now();
        
        // 2. Filtra tarefas ativas
        const activeTasks = tasks.filter(task => {
             if (!task.id) return false; // Pula tarefas sem ID
             
             // *** A CORREÇÃO ESTÁ AQUI ***
             // O bug era: new Date(task.endDate).getTime()
             // A correção é: task.endDate.getTime()
             // Não devemos criar um 'new Date()' a partir de um objeto Date já existente.
             
             const endDate = task.endDate ? task.endDate.getTime() : Infinity;
             const startDate = task.startDate ? task.startDate.getTime() : 0;
             
             // A lógica de filtro correta
             return endDate > now && startDate <= now;
        });

        return {
            config: data.config || {},
            leaderboards: data.leaderboards || {
                top100ByPoints: [],
                top100ByPosts: [],
                lastUpdated: null
            },
            dailyTasks: activeTasks // Retorna a lista CORRETAMENTE filtrada
        };
    } else {
        console.warn("System data document 'airdrop_public_data/data_v1' not found. Returning defaults.");
        return {
            config: { isActive: false, roundName: "Loading..." },
            leaderboards: { top100ByPoints: [], top100ByPosts: [], lastUpdated: null },
            dailyTasks: []
        };
    }
}

// =======================================================
//  FUNÇÕES DE DADOS DO USUÁRIO
// =======================================================

function generateReferralCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}


export async function getAirdropUser(walletAddress) {
    ensureAuthenticated();
    const userRef = doc(db, "airdrop_users", currentUser.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
        const userData = userSnap.data();
        let needsUpdate = false;
        const updates = {};
        
        if (!userData.referralCode) {
            updates.referralCode = generateReferralCode();
            needsUpdate = true;
        }
        if (userData.approvedSubmissionsCount === undefined) {
             updates.approvedSubmissionsCount = 0;
             needsUpdate = true;
        }
        if (userData.rejectedCount === undefined) {
             updates.rejectedCount = 0;
             needsUpdate = true;
        }
        if (userData.isBanned === undefined) {
             updates.isBanned = false;
             needsUpdate = true;
        }

        if (needsUpdate) {
             await updateDoc(userRef, updates);
             return { id: userSnap.id, ...userData, ...updates };
        }
        
        return { 
            id: userSnap.id, 
            approvedSubmissionsCount: 0, 
            rejectedCount: 0,
            isBanned: false,
            ...userData 
        };
    } else {
        const referralCode = generateReferralCode();
        const newUser = {
            walletAddress: walletAddress,
            referralCode: referralCode,
            totalPoints: 0,
            pointsMultiplier: 1.0, 
            approvedSubmissionsCount: 0,
            rejectedCount: 0,
            isBanned: false,
            createdAt: serverTimestamp()
        };
        await setDoc(userRef, newUser);
        return { id: userRef.id, ...newUser, createdAt: new Date().toISOString() };
    }
}


export async function isTaskEligible(taskId, cooldownHours) {
    ensureAuthenticated();
    if (!taskId || typeof taskId !== 'string' || taskId.trim() === '') {
        console.warn(`isTaskEligible called with invalid taskId: ${taskId}`);
        return { eligible: false, timeLeft: 0 };
    }

    const lastClaimRef = doc(db, "airdrop_users", currentUser.uid, "task_claims", taskId);
    const lastClaimSnap = await getDoc(lastClaimRef);

    const cooldownMs = cooldownHours * 60 * 60 * 1000;

    const lastClaimData = lastClaimSnap.data();
    const lastClaimTimestamp = lastClaimData?.timestamp;
    if (!lastClaimSnap.exists() || typeof lastClaimTimestamp !== 'string' || lastClaimTimestamp.trim() === '') {
        return { eligible: true, timeLeft: 0 };
    }

    try {
        const lastClaimDate = new Date(lastClaimTimestamp);
        if (isNaN(lastClaimDate.getTime())) {
             console.warn(`Invalid timestamp format for task ${taskId}:`, lastClaimTimestamp);
             return { eligible: true, timeLeft: 0 };
        }

        const lastClaimTime = lastClaimDate.getTime();
        const now = Date.now();
        const elapsed = now - lastClaimTime;

        if (elapsed >= cooldownMs) {
            return { eligible: true, timeLeft: 0 };
        } else {
            return { eligible: false, timeLeft: cooldownMs - elapsed };
        }
    } catch (dateError) {
         console.error(`Error parsing timestamp string for task ${taskId}:`, lastClaimTimestamp, dateError);
         return { eligible: true, timeLeft: 0 };
    }
}

export async function recordDailyTaskCompletion(task, currentMultiplier) {
    ensureAuthenticated();

    if (!task || !task.id) {
         throw new Error("Invalid task data provided.");
    }

    const eligibility = await isTaskEligible(task.id, task.cooldownHours);
    if (!eligibility.eligible) {
        throw new Error("Cooldown period is still active for this task.");
    }

    const userRef = doc(db, "airdrop_users", currentUser.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
        throw new Error("User profile not found.");
    }
    const userData = userSnap.data();
    const actualMultiplier = userData.pointsMultiplier || 1.0;

    const pointsToAdd = Math.round(task.points); 

    await updateDoc(userRef, { totalPoints: increment(pointsToAdd) });

    const claimRef = doc(db, "airdrop_users", currentUser.uid, "task_claims", task.id);
    await setDoc(claimRef, {
        timestamp: new Date().toISOString(),
        points: pointsToAdd
    });

    return pointsToAdd;
}


export async function addSubmission(url, platform) {
    ensureAuthenticated();
    const submissionsCol = collection(db, "airdrop_users", currentUser.uid, "submissions");

    const normalizedUrl = url.trim().toLowerCase();
    const validPlatforms = ['YouTube', 'Instagram', 'X/Twitter', 'Other'];
    if (!validPlatforms.includes(platform)) {
        throw new Error("Invalid platform specified.");
    }

    let isValidUrl = false;
    if (platform === 'YouTube' && (normalizedUrl.includes('youtube.com') || normalizedUrl.includes('youtu.be'))) isValidUrl = true;
    else if (platform === 'Instagram' && normalizedUrl.includes('instagram.com')) isValidUrl = true;
    else if (platform === 'X/Twitter' && (normalizedUrl.includes('twitter.com') || normalizedUrl.includes('x.com'))) isValidUrl = true;
    else if (platform === 'Other') isValidUrl = true; 

    if (!isValidUrl) {
         throw new Error(`The provided URL does not seem to be a valid ${platform} link.`);
    }


    const q = query(submissionsCol,
        where("url", "==", normalizedUrl),
        where("status", "in", ["pending", "approved", "flagged_suspicious", "auditing"])
    );
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
        throw new Error("This content has already been submitted and is pending or resolved.");
    }

    let basePoints = 1000;
    if (platform === 'YouTube') basePoints = 5000;
    else if (platform === 'Instagram') basePoints = 3000;
    else if (platform === 'X/Twitter') basePoints = 1500;

    await addDoc(submissionsCol, {
        url: normalizedUrl,
        platform: platform,
        status: 'pending',
        basePoints: basePoints,
        pointsAwarded: 0,
        submittedAt: serverTimestamp(),
        resolvedAt: null,
    });
}


export async function getUserSubmissions() {
    ensureAuthenticated();
    const submissionsCol = collection(db, "airdrop_users", currentUser.uid, "submissions");
    const q = query(submissionsCol, orderBy("submittedAt", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            submissionId: doc.id,
            ...data,
            submittedAt: data.submittedAt?.toDate ? data.submittedAt.toDate() : null,
            resolvedAt: data.resolvedAt?.toDate ? data.resolvedAt.toDate() : null,
        };
    });
}


export async function getUserFlaggedSubmissions() {
    ensureAuthenticated();
    const submissionsCol = collection(db, "airdrop_users", currentUser.uid, "submissions");
    const q = query(submissionsCol, where("status", "==", "flagged_suspicious"), orderBy("submittedAt", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
         const data = doc.data();
        return {
            submissionId: doc.id,
            ...data,
            submittedAt: data.submittedAt?.toDate ? data.submittedAt.toDate() : null,
        };
    });
}


export async function resolveFlaggedSubmission(submissionId, resolution) {
    ensureAuthenticated();
    const userRef = doc(db, "airdrop_users", currentUser.uid);
    const submissionRef = doc(db, "airdrop_users", currentUser.uid, "submissions", submissionId);

    const submissionSnap = await getDoc(submissionRef);
    if (!submissionSnap.exists() || submissionSnap.data().status !== 'flagged_suspicious') {
        throw new Error("Submission not found or not flagged for review.");
    }

    const submissionData = submissionSnap.data();
    const newStatus = resolution === 'not_fraud' ? 'approved' : 'rejected';

    if (newStatus === 'approved') {
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) throw new Error("User profile not found.");
        const userData = userSnap.data();
        const newApprovedCount = (userData.approvedSubmissionsCount || 0) + 1;
        const multiplier = Math.min(10.0, newApprovedCount * 0.1); 

        const pointsAwarded = Math.round(submissionData.basePoints * multiplier);

        await updateDoc(submissionRef, {
            status: newStatus,
            pointsAwarded: pointsAwarded,
            multiplierApplied: multiplier, 
            resolvedAt: serverTimestamp()
        });
        await updateDoc(userRef, {
            totalPoints: increment(pointsAwarded),
            approvedSubmissionsCount: increment(1)
        });

    } else { 
        await updateDoc(submissionRef, {
            status: newStatus,
            pointsAwarded: 0,
            resolvedAt: serverTimestamp()
        });
    }
}


export async function autoApproveSubmission(submissionId) {
    ensureAuthenticated();
    const userRef = doc(db, "airdrop_users", currentUser.uid);
    const submissionRef = doc(db, "airdrop_users", currentUser.uid, "submissions", submissionId);

    const submissionSnap = await getDoc(submissionRef);
    if (!submissionSnap.exists()) {
        throw new Error("Submission not found.");
    }
    const submissionData = submissionSnap.data();

    if (submissionData.status !== 'pending') {
         console.warn(`Submission ${submissionId} is no longer pending. Skipping auto-approval.`);
         return; 
    }
    
    const submittedAt = submissionData.submittedAt?.toDate ? submissionData.submittedAt.toDate() : null;
    if (!submittedAt) {
         throw new Error("Submission has no timestamp.");
    }

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    if (submittedAt > twoHoursAgo) {
         console.warn(`Submission ${submissionId} is not old enough for auto-approval.`);
         return;
    }
    
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) throw new Error("User profile not found.");
    const userData = userSnap.data();
    
    const newApprovedCount = (userData.approvedSubmissionsCount || 0) + 1;
    const multiplierApplied = Math.min(10.0, newApprovedCount * 0.1);
    
    const pointsAwarded = Math.round(submissionData.basePoints * multiplierApplied);

    await updateDoc(userRef, {
        totalPoints: increment(pointsAwarded),
        approvedSubmissionsCount: increment(1)
    });

    await updateDoc(submissionRef, {
        status: 'approved',
        pointsAwarded: pointsAwarded,
        multiplierApplied: multiplierApplied,
        resolvedAt: serverTimestamp()
    });
}


// =======================================================
//  FUNÇÕES DE ADMIN
// =======================================================
export async function getAllTasksForAdmin() {
    const tasksCol = collection(db, "daily_tasks");
    const q = query(tasksCol, orderBy("endDate")); 
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        startDate: doc.data().startDate?.toDate ? doc.data().startDate.toDate() : null,
        endDate: doc.data().endDate?.toDate ? doc.data().endDate.toDate() : null,
    }));
}

export async function addOrUpdateDailyTask(taskData) {
     const dataToSave = { ...taskData };
    if (dataToSave.startDate instanceof Date) {
        dataToSave.startDate = Timestamp.fromDate(dataToSave.startDate);
    }
     if (dataToSave.endDate instanceof Date) {
        dataToSave.endDate = Timestamp.fromDate(dataToSave.endDate);
    }
     if (taskData.id === undefined) delete dataToSave.id;


    if (taskData.id) {
        const taskRef = doc(db, "daily_tasks", taskData.id);
        const { id, ...data } = dataToSave; 
        await setDoc(taskRef, data, { merge: true }); 
    } else {
         delete dataToSave.id; 
        await addDoc(collection(db, "daily_tasks"), dataToSave);
    }
}

export async function deleteDailyTask(taskId) {
    await deleteDoc(doc(db, "daily_tasks", taskId));
}

export async function getAllSubmissionsForAdmin() {
    const allSubmissions = [];
    const usersSnapshot = await getDocs(collection(db, "airdrop_users"));

    for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;
        const userData = userDoc.data();
        const submissionsCol = collection(db, "airdrop_users", userId, "submissions");
        
        const q = query(submissionsCol, where("status", "in", ["pending", "auditing", "flagged_suspicious"]), orderBy("submittedAt", "desc"));
        const submissionsSnapshot = await getDocs(q);

        submissionsSnapshot.forEach(subDoc => {
             const subData = subDoc.data();
            allSubmissions.push({
                userId: userId,
                walletAddress: userData.walletAddress,
                submissionId: subDoc.id,
                ...subData,
                submittedAt: subData.submittedAt?.toDate ? subData.submittedAt.toDate() : null,
                resolvedAt: subData.resolvedAt?.toDate ? subData.resolvedAt.toDate() : null,
            });
        });
    }
    return allSubmissions;
}


export async function updateSubmissionStatus(userId, submissionId, status, points, newMultiplier) {
    const userRef = doc(db, "airdrop_users", userId);
    const submissionRef = doc(db, "airdrop_users", userId, "submissions", submissionId);

    const [userSnap, submissionSnap] = await Promise.all([
         getDoc(userRef),
         getDoc(submissionRef)
    ]);
    
    if (!submissionSnap.exists()) throw new Error("Submission not found.");
    if (!userSnap.exists()) throw new Error("User profile not found.");
    
    const submissionData = submissionSnap.data();
    const userData = userSnap.data();
    
    const userUpdates = {}; 

    let pointsAwarded = 0;
    let multiplierApplied = 0;

    if (status === 'approved') {
         const currentApprovedCount = userData.approvedSubmissionsCount || 0;
         multiplierApplied = Math.min(10.0, (currentApprovedCount + 1) * 0.1);
         pointsAwarded = Math.round(submissionData.basePoints * multiplierApplied);

         userUpdates.totalPoints = increment(pointsAwarded);
         userUpdates.approvedSubmissionsCount = increment(1);

          if (newMultiplier && typeof newMultiplier === 'number' && newMultiplier > (userData.pointsMultiplier || 1.0)) {
                userUpdates.pointsMultiplier = newMultiplier;
          }
         
    } else if (status === 'rejected') {
        const currentRejectedCount = userData.rejectedCount || 0;
        userUpdates.rejectedCount = increment(1);
        
        if (currentRejectedCount + 1 >= 3) {
            userUpdates.isBanned = true;
        }
    }
    
    if (Object.keys(userUpdates).length > 0) {
        await updateDoc(userRef, userUpdates);
    }

    await updateDoc(submissionRef, {
        status: status,
        pointsAwarded: pointsAwarded,
        multiplierApplied: multiplierApplied,
        resolvedAt: serverTimestamp()
    });
}