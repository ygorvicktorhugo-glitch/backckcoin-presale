// pages/AirdropPage.js
// Contém a lógica e renderização da interface do Airdrop para o usuário.

import { State } from '../state.js'; //
import * as db from '../modules/firebase-auth-service.js'; //
import { showToast, closeModal, openModal } from '../ui-feedback.js'; //
import { formatAddress, renderNoData, formatBigNumber, renderLoading, renderError } from '../utils.js';

// --- Estado da Página Airdrop ---
let airdropState = {
    isConnected: false,
    systemConfig: null,
    ugcBasePoints: null, // Pontos base dinâmicos para UGC (lidos da config)
    leaderboards: null,
    user: null,
    dailyTasks: [], // Tarefas ativas com status de elegibilidade
    userSubmissions: [], // Histórico de submissões do usuário
    flaggedSubmissions: [], // Submissões que precisam de revisão do usuário
    isBanned: false, // Status de banimento do usuário
    activeTab: 'profile', // Aba padrão: Perfil
};

// --- Constantes ---
const DEFAULT_HASHTAGS = "#Backchain #BKC #Web3 #Crypto #Airdrop"; //
const AUTO_APPROVE_HOURS = 2; // Delay VISUAL para aprovação de UGC

// --- Mapeamentos de UI ---
// Usados para estilizar status e plataformas consistentemente
const statusUI = {
    pending: { text: 'Pending Review', color: 'text-amber-400', bgColor: 'bg-amber-900/50', icon: 'fa-clock' }, //
    auditing: { text: 'Auditing', color: 'text-blue-400', bgColor: 'bg-blue-900/50', icon: 'fa-magnifying-glass' }, //
    approved: { text: 'Approved', color: 'text-green-400', bgColor: 'bg-green-900/50', icon: 'fa-check-circle' }, //
    rejected: { text: 'Rejected', color: 'text-red-400', bgColor: 'bg-red-900/50', icon: 'fa-times-circle' }, //
    flagged_suspicious: { text: 'Flagged - Review!', color: 'text-red-300', bgColor: 'bg-red-800/60', icon: 'fa-flag' }, //
    approved_visual: { text: 'Approved', color: 'text-green-400', bgColor: 'bg-green-900/50', icon: 'fa-check-circle' } // Status visual após delay
};
const platformUI = {
    'YouTube': { icon: 'fa-youtube', color: 'text-red-500' }, //
    'Instagram': { icon: 'fa-instagram', color: 'text-pink-500' }, //
    'X/Twitter': { icon: 'fa-twitter', color: 'text-blue-400' }, //
    'Other': { icon: 'fa-globe', color: 'text-gray-400' }, //
};

// =======================================================
//  1. FUNÇÃO PRINCIPAL DE CARREGAMENTO DE DADOS
// =======================================================
async function loadAirdropData() {
    // Reseta estado antes de carregar
    airdropState.isConnected = State.isConnected; //
    airdropState.user = null; //
    airdropState.userSubmissions = []; //
    airdropState.flaggedSubmissions = []; //
    airdropState.isBanned = false; //
    airdropState.ugcBasePoints = null; //

    try {
        // Busca dados públicos (config, tasks ativas, leaderboards)
        const publicData = await db.getPublicAirdropData(); //

        airdropState.systemConfig = publicData.config; //
        // Carrega pontos base UGC da config, com fallback
        airdropState.ugcBasePoints = publicData.config?.ugcBasePoints || { //
            'YouTube': 5000, 'Instagram': 3000, 'X/Twitter': 1500, 'Other': 1000 // Fallback
        };
        airdropState.leaderboards = publicData.leaderboards; //
        airdropState.dailyTasks = publicData.dailyTasks; // Já vêm filtradas e processadas

        // Se conectado, busca dados do usuário
        if (airdropState.isConnected && State.userAddress) { //
            const [user, submissions, flagged] = await Promise.all([ //
                db.getAirdropUser(State.userAddress), //
                db.getUserSubmissions(), //
                db.getUserFlaggedSubmissions() //
            ]);
            airdropState.user = user; //
            airdropState.userSubmissions = submissions; //
            airdropState.flaggedSubmissions = flagged; //

            // Verifica banimento
            if (user.isBanned) { //
                airdropState.isBanned = true; //
                console.warn("User is banned from Airdrop."); //
                return; // Para carregamento
            }

            // A Lógica de Auto-Aprovação foi REMOVIDA daqui

            // Carrega elegibilidade das tarefas diárias
            if (airdropState.dailyTasks.length > 0) { //
                 airdropState.dailyTasks = await Promise.all(airdropState.dailyTasks.map(async (task) => { //
                     try { //
                         if (!task.id) return { ...task, eligible: false, timeLeftMs: 0, error: true }; //
                         const eligibility = await db.isTaskEligible(task.id, task.cooldownHours); //
                         return { ...task, eligible: eligibility.eligible, timeLeftMs: eligibility.timeLeft }; //
                     } catch (eligibilityError) { //
                          console.error(`Error checking eligibility for task ${task.id}:`, eligibilityError); //
                          return { ...task, eligible: false, timeLeftMs: 0, error: true }; //
                     }
                 }));
            }
        }
    } catch (error) { //
        console.error("Failed to load airdrop data:", error); //
        // Verifica se o erro foi o 'is not a function' e dá uma dica
        if (error instanceof TypeError && error.message.includes("is not a function")) { //
             console.error("POSSIBLE CAUSE: Check if functions like getUserSubmissions are correctly exported in firebase-auth-service.js or clear browser cache."); //
             showToast("Error loading user data. Try refreshing (Ctrl+Shift+R).", "error"); //
        } else { //
             showToast("Error loading Airdrop data. Please refresh.", "error"); //
        }
        // Define estado de erro
        airdropState.systemConfig = { isActive: false, roundName: "Error Loading Data" }; //
        airdropState.leaderboards = null; //
        airdropState.dailyTasks = []; //
        airdropState.ugcBasePoints = {}; //
    }
}

// =======================================================
//  2. FUNÇÕES DE INTERAÇÃO DO USUÁRIO
// =======================================================

// --- Troca de Abas ---
function handleTabSwitch(e) {
    const button = e.target.closest('.airdrop-tab-btn'); //
    if (button) { //
        const targetTab = button.getAttribute('data-target'); //
        if (targetTab && airdropState.activeTab !== targetTab) { //
            // Limpa timers de cooldown visuais antigos ao trocar de aba
            document.querySelectorAll('.task-card-link').forEach(card => { //
                if (card._cooldownInterval) clearInterval(card._cooldownInterval); //
                card._cooldownInterval = null; //
            });
            airdropState.activeTab = targetTab; //
            renderAirdropContent(); // Re-renderiza tudo
        }
    }
}

// --- Formata Tempo Restante (HH:MM:SS ou Ready) ---
const formatTimeLeft = (ms) => {
    if (ms <= 0) return '<i class="fa-solid fa-check mr-1"></i> Ready'; // Estado pronto
    const totalSeconds = Math.floor(ms / 1000); //
    const hours = Math.floor(totalSeconds / 3600); //
    const minutes = Math.floor((totalSeconds % 3600) / 60); //
    const seconds = totalSeconds % 60; //
    // Formato HH:MM:SS
    return `Cooldown: ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`; //
};


// --- Ação de Clicar no Card da Tarefa Diária ---
async function handleGoToTask(e) {
    const cardLink = e.target.closest('.task-card-link'); //
    if (!cardLink || cardLink.classList.contains('task-disabled')) return; //

    e.preventDefault(); // Previne navegação padrão do link

    const taskId = cardLink.dataset.taskId; //
    const taskUrl = cardLink.dataset.taskUrl; //
    const task = airdropState.dailyTasks.find(t => t.id === taskId); //

    if (!task) return showToast("Task not found.", "error"); //
    if (!airdropState.user) return showToast("User profile not loaded.", "error"); //

    const statusElement = cardLink.querySelector('.task-cooldown-status'); //
    const originalStatusHTML = statusElement ? statusElement.innerHTML : ''; //
    if (statusElement) renderLoading(statusElement, 'Processing...'); //

    cardLink.classList.add('task-disabled', 'opacity-60', 'cursor-not-allowed'); //

    try { //
        const pointsEarned = await db.recordDailyTaskCompletion(task, airdropState.user.pointsMultiplier); //
        showToast(`Task complete! +${pointsEarned} points!`, "success"); //

        // Abre link em nova aba (se houver)
        if (taskUrl && taskUrl.startsWith('http')) { //
            window.open(taskUrl, '_blank', 'noopener,noreferrer'); //
        }

        // Atualiza estado local e inicia timer visual
        const taskIndex = airdropState.dailyTasks.findIndex(t => t.id === taskId); //
        if (taskIndex > -1) { //
            const cooldownMs = task.cooldownHours * 3600000; //
            airdropState.dailyTasks[taskIndex].eligible = false; //
            airdropState.dailyTasks[taskIndex].timeLeftMs = cooldownMs; //
            if (statusElement) { //
                statusElement.innerHTML = formatTimeLeft(cooldownMs); // Mostra cooldown
                startIndividualCooldownTimer(cardLink, statusElement, cooldownMs); // Inicia timer visual
            }
        }
        // Recarrega dados gerais após um pequeno delay
        setTimeout(async () => { //
            await loadAirdropData(); //
            // Re-renderiza só se ainda estiver na aba de tarefas
            if (airdropState.activeTab === 'tasks') renderAirdropContent(); //
        }, 500); //

    } catch (error) { //
        // Tratamento de Erros
        if (error.message.includes("Cooldown period is still active")) { //
             showToast("Cooldown active. Cannot complete this task yet.", "error"); //
             // Tenta reexibir o tempo restante correto
             const eligibility = await db.isTaskEligible(task.id, task.cooldownHours); //
             if (statusElement && document.body.contains(statusElement)) statusElement.innerHTML = formatTimeLeft(eligibility.timeLeft); //
        } else { //
             showToast(`Failed to record task: ${error.message}`, "error"); //
             console.error("Go To Task Error:", error); //
             if (statusElement && document.body.contains(statusElement)) statusElement.innerHTML = originalStatusHTML; // Restaura status
        }
        // Reabilita o card em caso de erro
        if(document.body.contains(cardLink)) { //
            cardLink.classList.remove('task-disabled', 'opacity-60', 'cursor-not-allowed'); //
        }
    }
}

// --- Timer Visual de Cooldown para um Card de Tarefa ---
function startIndividualCooldownTimer(cardLink, statusElement, initialMs) {
    if (!cardLink || !statusElement) return; //
    if (cardLink._cooldownInterval) clearInterval(cardLink._cooldownInterval); // Limpa timer antigo

    let countdownMs = initialMs; //

    const updateTimer = () => { //
        countdownMs -= 1000; //

        // Verifica se os elementos ainda existem
        if (!document.body.contains(cardLink) || !document.body.contains(statusElement)) { //
            clearInterval(cardLink._cooldownInterval); //
            cardLink._cooldownInterval = null; //
            return; // Para se o elemento sumiu
        }

        if (countdownMs <= 0) { //
            clearInterval(cardLink._cooldownInterval); //
            cardLink._cooldownInterval = null; //
            // Define o status como pronto/disponível
            const task = airdropState.dailyTasks.find(t => t.id === cardLink.dataset.taskId); //
            // Atualiza o texto dentro do span de status
            statusElement.innerHTML = task?.url ? '<i class="fa-solid fa-arrow-up-right-from-square mr-1"></i> Go & Earn' : '<i class="fa-solid fa-check mr-1"></i> Earn Points'; //
            // Atualiza o estilo do span de status
            statusElement.classList.remove('text-zinc-400', 'bg-zinc-700'); //
            statusElement.classList.add('text-amber-400', 'bg-amber-900/50'); // Usa estilo "Pronto"
            // Reabilita o card
            cardLink.classList.remove('task-disabled', 'opacity-60', 'cursor-not-allowed'); //

            // Atualiza estado local (opcional)
            if(task) { //
                const taskIndex = airdropState.dailyTasks.findIndex(t => t.id === task.id); //
                if (taskIndex > -1) { //
                    airdropState.dailyTasks[taskIndex].eligible = true; //
                    airdropState.dailyTasks[taskIndex].timeLeftMs = 0; //
                }
            }
        } else {
            // Atualiza o tempo restante no span
            statusElement.innerHTML = formatTimeLeft(countdownMs); //
             // Garante que o estilo de cooldown está aplicado ao span
             statusElement.classList.remove('text-amber-400', 'bg-amber-900/50'); // Remove "Pronto"
            statusElement.classList.add('text-zinc-400', 'bg-zinc-700'); // Aplica "Cooldown"

        }
    };

    updateTimer(); // Roda imediatamente
    cardLink._cooldownInterval = setInterval(updateTimer, 1000); // Roda a cada segundo
}


// --- Gera Texto de Compartilhamento (Referral) ---
function generateShareText() {
    if (!airdropState.user || !airdropState.user.referralCode) return "Connect wallet to get your referral link."; //
    const referralLink = `https://backcoin.org/?ref=${airdropState.user.referralCode}`; //
    return `Check out Backchain! Earn rewards and support the network.\nMy referral link: ${referralLink}\n\n${DEFAULT_HASHTAGS}`; //
}

// --- Resolve Submissão Flagrada ---
async function handleResolveSubmission(e) {
    const button = e.target.closest('.resolve-flagged-btn'); //
    if (!button || button.disabled) return; //
    const submissionId = button.dataset.submissionId; //
    const resolution = button.dataset.resolution; //
    if (!submissionId || !resolution) return; //

    const card = button.closest('.flagged-submission-card'); //
    const buttonsContainer = card?.querySelector('.resolve-buttons'); //
    if(buttonsContainer) renderLoading(buttonsContainer); //

    try { //
        await db.resolveFlaggedSubmission(submissionId, resolution); //
        showToast(`Submission marked as '${resolution}'.`, resolution === 'not_fraud' ? 'success' : 'info'); //
        await loadAirdropData(); //
        renderAirdropContent(); //
    } catch (error) { //
        showToast(`Error resolving submission: ${error.message}`, "error"); //
        console.error("Resolve Flagged Error:", error); //
        renderAirdropContent(); // Re-renderiza para restaurar botões
    }
}

// --- Ação de Submeter Link UGC ---
async function handleSubmitUgcClick(e) {
    const submitButton = e.target.closest('.submitUgcLinkBtn'); // Atualizado ID/Classe
    if (!submitButton || submitButton.disabled) return; //

    // Encontra o input de URL associado (usando classes consistentes)
    const parentArea = submitButton.closest('.submission-area'); //
    const urlInput = parentArea?.querySelector('.ugcUrlInput'); //

    if (!urlInput) { //
        console.error("Could not find UGC URL input field within submission area."); //
        return showToast("Internal error: Input field not found.", "error"); //
    }

    const url = urlInput.value.trim(); //

    // Validação básica no frontend
    if (!url) return showToast("Please paste the content URL first.", "warning"); //
    if (!url.toLowerCase().startsWith('http://') && !url.toLowerCase().startsWith('https://')) { //
        return showToast("Invalid URL. Must start with http:// or https://", "error"); //
    }

    // Feedback visual
    const originalButtonText = submitButton.innerHTML; //
    submitButton.disabled = true; //
    renderLoading(submitButton, 'Submitting...'); //

    try { //
        // Chama addSubmission (backend detecta plataforma, valida, busca pontos, verifica duplicata)
        await db.addSubmission(url); //

        showToast("Link submitted successfully! Pending review.", "success"); //
        urlInput.value = ''; // Limpa o campo
        await loadAirdropData(); // Recarrega tudo
        renderAirdropContent(); // Re-renderiza

    } catch (error) { //
        // Mostra erros específicos do backend
        showToast(`Submission failed: ${error.message}`, "error"); //
        console.error("UGC Submit Error:", error); //
    } finally { //
        // Restaura o botão
        if(document.body.contains(submitButton)) { //
             submitButton.disabled = false; //
             submitButton.innerHTML = originalButtonText; //
        }
    }
}


// =======================================================
//  3. FUNÇÕES DE RENDERIZAÇÃO DAS ABAS (CORRIGIDAS)
// =======================================================

// --- Container Padrão ---
function renderSectionContainer(title, iconClass, contentHtml) {
    return `
        <div class="bg-sidebar border border-border-color rounded-xl shadow-lg overflow-hidden mb-8">
            <div class="p-5 border-b border-zinc-700/50 bg-main">
                <h2 class="text-xl font-bold text-white flex items-center gap-3">
                    <i class="fa-solid ${iconClass} text-amber-400 fa-fw"></i>
                    ${title}
                </h2>
            </div>
            <div class="p-6">
                ${contentHtml}
            </div>
        </div>
    `; //
}

// --- Área de Submissão Reutilizável ---
function renderSubmissionArea() {
    if (!airdropState.isConnected || !airdropState.user) { //
        return renderNoData(null, 'Connect your wallet to submit content.'); //
    }
    const referralCode = airdropState.user.referralCode || 'N/A'; //
    const referralLink = `https://backcoin.org/?ref=${referralCode}`; //

    // Adiciona classe 'submission-area' ao container e 'ugcUrlInput' ao input
    return `
        <div class="submission-area bg-main border border-border-color rounded-xl p-6 mb-8">
            <h3 class="text-lg font-bold text-white mb-4"><i class="fa-solid fa-share-nodes mr-2 text-blue-400"></i> Share & Submit Your Content</h3>

            <div class="mb-5">
                <label class="block text-sm font-medium text-zinc-400 mb-1" for="referralLinkInput_submitArea">Your Referral Link:</label>
                <div class="flex flex-col sm:flex-row gap-2">
                    <input type="text" id="referralLinkInput_submitArea" value="${referralLink}" readonly class="form-input flex-1 !bg-zinc-800 border-zinc-700 font-mono text-sm">
                    <button id="copyReferralBtn_submitArea" class="btn btn-secondary text-sm shrink-0 w-full sm:w-auto">
                        <i class="fa-solid fa-copy mr-1"></i> Copy Link
                    </button>
                </div>
                <p class="text-xs text-zinc-500 mt-2">Include this link in your posts!</p>
            </div>

            <div class="border-t border-border-color pt-5">
                 <label for="ugcUrlInput_submitArea" class="block text-sm font-medium text-zinc-300 mb-1">
                    Paste your content link here (YouTube video, Instagram post/reel, X tweet):
                </label>
                <div class="flex flex-col sm:flex-row gap-2">
                    <input type="url" id="ugcUrlInput_submitArea" required placeholder="https://..." class="ugcUrlInput form-input flex-1">
                    <button id="submitUgcLinkBtn_submitArea" class="submitUgcLinkBtn btn btn-primary font-bold text-sm shrink-0 w-full sm:w-auto">
                        <i class="fa-solid fa-paper-plane mr-2"></i>Submit Link for Review
                    </button>
                </div>
                 <p class="text-xs text-zinc-500 mt-2">System auto-detects platform. Points added immediately, visually approved after ${AUTO_APPROVE_HOURS} hours.</p>
            </div>
        </div>
    `; //
}

// --- ABA 1: PERFIL ---
function renderProfileContent(el) {
    if (!el) return; //

    if (!airdropState.isConnected) { //
        const noDataHtml = renderNoData(null, 'Connect wallet to view profile.'); //
        el.innerHTML = renderSectionContainer('Profile', 'fa-user-check', noDataHtml); //
        return; //
    }
     if (!airdropState.user) { //
        renderLoading(el, 'Loading profile...'); //
        return; //
    }

    const { user, flaggedSubmissions, userSubmissions } = airdropState; //
    const totalPoints = user.totalPoints || 0; //
    const approvedCount = user.approvedSubmissionsCount || 0; //
    const rejectedCount = user.rejectedCount || 0; //
    const ugcMultiplier = Math.min(10.0, approvedCount * 0.1); //
    const multiplierDisplay = `${ugcMultiplier.toFixed(1)}x`; //
    const pendingPoints = userSubmissions //
        .filter(sub => sub.status === 'pending' || sub.status === 'auditing') //
        .reduce((sum, sub) => sum + (sub.basePoints || 0), 0); //

    // Bloco de Ação Requerida (Flagged)
    const flaggedReviewBlock = flaggedSubmissions.length > 0 ? `
        <div class="bg-red-900/40 border-2 border-red-500/80 rounded-xl p-6 mb-6 animate-pulse-slow">
            <h3 class="text-xl font-bold text-red-300 mb-4 flex items-center gap-2">
                <i class="fa-solid fa-triangle-exclamation"></i> Action Required: Review Submissions
            </h3>
            <p class="text-sm text-zinc-200 mb-5">Our system flagged the following submissions. Please review them:</p>
            <div id="flagged-submissions-list" class="space-y-4">
                ${flaggedSubmissions.map(sub => {
                     const ui = platformUI[sub.platform] || platformUI['Other']; //
                     // Card Flagged
                     return `
                        <div class="flagged-submission-card bg-main border border-red-600/70 p-4 rounded-lg flex flex-col sm:flex-row justify-between items-start gap-4">
                           <div class="flex items-start gap-3 flex-grow min-w-0">
                                <i class="fa-brands ${ui.icon} ${ui.color} text-2xl mt-1 w-6 text-center shrink-0"></i>
                                <div class="min-w-0">
                                    <a href="${sub.url}" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 font-semibold break-all block text-sm">
                                        ${sub.url}
                                    </a>
                                    <p class="text-xs text-zinc-400 mt-1">Submitted: ${sub.submittedAt ? sub.submittedAt.toLocaleDateString('pt-BR') : 'N/A'}</p>
                                </div>
                            </div>
                            <div class="resolve-buttons flex gap-2 mt-2 sm:mt-0 shrink-0 self-end sm:self-center">
                                <button data-submission-id="${sub.submissionId}" data-resolution="not_fraud" class="resolve-flagged-btn btn btn-success btn-xs">
                                    <i class="fa-solid fa-check mr-1"></i> Legitimate
                                </button>
                                <button data-submission-id="${sub.submissionId}" data-resolution="is_fraud" class="resolve-flagged-btn btn btn-danger btn-xs">
                                    <i class="fa-solid fa-times mr-1"></i> Fraud/Spam
                                </button>
                            </div>
                        </div>
                    `;}).join('')}
            </div>
        </div>
    ` : ''; //

    // Bloco Principal de Stats do Perfil
    const profileStatsHtml = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div class="md:col-span-1 space-y-4">
                 <div class="bg-main border border-border-color rounded-xl p-5 text-center shadow-inner">
                    <p class="text-sm text-zinc-400 mb-1 font-semibold uppercase tracking-wider">Total Points</p>
                    <p class="text-5xl font-extrabold text-yellow-400 tracking-tight">${totalPoints.toLocaleString('pt-BR')}</p>
                    <p class="text-xs text-zinc-500 mt-1">(Daily Tasks + UGC)</p>
                </div>
                <div class="bg-main border border-border-color rounded-xl p-5 text-center shadow-inner">
                    <p class="text-sm text-zinc-400 mb-1 font-semibold uppercase tracking-wider">UGC Multiplier</p>
                    <p class="text-4xl font-bold text-green-400">${multiplierDisplay}</p>
                    <p class="text-xs text-zinc-500 mt-1">(${approvedCount} approved posts)</p>
                </div>
            </div>
            <div class="md:col-span-2 space-y-4">
                 <div class="bg-main border border-border-color rounded-xl p-5 text-center shadow-inner">
                    <p class="text-sm text-zinc-400 mb-1 font-semibold uppercase tracking-wider">Pending UGC (Visual)</p>
                    <p class="text-4xl font-bold text-amber-400">${pendingPoints.toLocaleString('pt-BR')}</p>
                     <p class="text-xs text-zinc-500 mt-1">(Estimated base points)</p>
                </div>
                <div class="bg-main border border-border-color rounded-xl p-5 text-center shadow-inner">
                    <p class="text-sm text-zinc-400 mb-1 font-semibold uppercase tracking-wider">Rejections</p>
                    <p class="text-4xl font-bold ${rejectedCount >= 2 ? 'text-red-400 animate-pulse-slow' : 'text-orange-400'}">${rejectedCount} / 3</p>
                    <p class="text-xs text-zinc-500 mt-1">(Reaching 3 results in a ban)</p>
                </div>
            </div>
        </div>
    `; //

    // Combina Blocos: Flags + Stats + Área de Submissão
    el.innerHTML = `
        ${flaggedReviewBlock}
        ${renderSectionContainer('Your Airdrop Stats', 'fa-chart-simple', profileStatsHtml)}
        ${renderSubmissionArea()} `; //

    // --- Adiciona Listeners ---
    document.getElementById('copyReferralBtn_submitArea')?.addEventListener('click', (e) => { /* ... (lógica de copiar igual) ... */ }); //
    document.querySelector('.submitUgcLinkBtn')?.addEventListener('click', handleSubmitUgcClick); //
    document.getElementById('flagged-submissions-list')?.addEventListener('click', handleResolveSubmission); //
}


// --- ABA 2: SHARE & EARN ---
function renderSubmissionPanel(el) {
    if (!el) return; //
     document.querySelectorAll('.task-card-link').forEach(card => { /* ... (limpa timers) ... */ }); //

    if (!airdropState.isConnected) { //
        const noDataHtml = renderNoData(null, 'Connect wallet to submit & view history.'); //
        el.innerHTML = renderSectionContainer('Share & Earn', 'fa-share-nodes', noDataHtml); //
        return; //
    }

    // Calcula Stats
    const stats = { total: 0, pending: 0, approved: 0, rejected: 0 }; //
    if (airdropState.userSubmissions) {
         airdropState.userSubmissions.forEach(sub => { //
            stats.total++; //
            // Contagem de status REAL do banco
            if (sub.status === 'pending' || sub.status === 'auditing') stats.pending++; //
            else if (sub.status === 'approved') stats.approved++; //
            else if (sub.status === 'rejected') stats.rejected++; //
        });
     }
    const statsHtml = `
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div class="stat-card">
                <p>Total Posts</p><p class="text-white">${stats.total}</p>
            </div>
            <div class="stat-card border-green-500/50">
                <p>Approved</p><p class="text-green-400">${stats.approved}</p>
            </div>
            <div class="stat-card border-amber-500/50">
                <p>Pending</p><p class="text-amber-400">${stats.pending}</p>
            </div>
            <div class="stat-card border-red-500/50">
                <p>Rejected</p><p class="text-red-400">${stats.rejected}</p>
            </div>
        </div>
        <style>
            .stat-card { background-color: var(--bg-main); border: 1px solid var(--border-color); border-radius: 0.75rem; padding: 1rem; text-align: center; }
            .stat-card p:first-child { text-sm text-zinc-400 mb-1 font-semibold uppercase tracking-wider; }
            .stat-card p:last-child { text-3xl font-extrabold; }
        </style>`; //

    // Renderiza Histórico (COM DELAY VISUAL)
    const renderSubmissionHistory = () => { //
        if (!airdropState.userSubmissions || airdropState.userSubmissions.length === 0) { //
            return renderNoData(null, 'You have not submitted any content yet.'); //
        }
        const sortedSubs = [...airdropState.userSubmissions].sort((a, b) => (b.submittedAt?.getTime() || 0) - (a.submittedAt?.getTime() || 0)); //
        const totalSubmissions = sortedSubs.length; //
        const nowMs = Date.now(); //
        const twoHoursMs = AUTO_APPROVE_HOURS * 60 * 60 * 1000; //

        return sortedSubs.map((sub, index) => { //
            const submittedAtMs = sub.submittedAt?.getTime(); //
            let displayStatusKey = sub.status; //

            // LÓGICA DO DELAY PSICOLÓGICO
            if (sub.status === 'pending' && submittedAtMs && (nowMs - submittedAtMs >= twoHoursMs)) { //
                displayStatusKey = 'approved_visual'; //
            }

            const uiStatus = statusUI[displayStatusKey] || statusUI.pending; //
            const uiPlatform = platformUI[sub.platform] || platformUI.Other; //
            let pointsDisplay = ''; //
            if (displayStatusKey === 'approved' || displayStatusKey === 'approved_visual') { //
                 const pointsToShow = sub._pointsCalculated !== undefined ? sub._pointsCalculated : (sub.pointsAwarded || 0); //
                 pointsDisplay = `(+${pointsToShow.toLocaleString('pt-BR')} Pts)`; //
            } else if (['pending', 'auditing', 'flagged_suspicious'].includes(displayStatusKey)) { //
                pointsDisplay = `(${sub.basePoints || 0} base pts)`; //
            }

            // Card do Histórico
            return `
                <div class="submission-history-card bg-main border border-border-color rounded-lg p-4 mb-3 flex flex-col sm:flex-row items-start gap-4 transition-colors hover:bg-zinc-800/50">
                    <div class="flex-shrink-0 w-10 text-center pt-1"><span class="text-lg font-bold text-zinc-500">#${totalSubmissions - index}</span></div>
                    <div class="flex items-start gap-3 flex-grow min-w-0">
                        <i class="fa-brands ${uiPlatform.icon} ${uiPlatform.color} text-2xl mt-1 w-6 text-center shrink-0"></i>
                        <div class="min-w-0">
                            <a href="${sub.url}" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 font-semibold break-words block text-sm leading-snug">${sub.url}</a>
                            <p class="text-xs text-zinc-400 mt-1.5">Submitted: ${sub.submittedAt ? sub.submittedAt.toLocaleString('pt-BR') : 'N/A'}</p>
                        </div>
                    </div>
                    <div class="text-left sm:text-right mt-2 sm:mt-0 shrink-0 flex flex-col items-end min-w-[120px] self-start sm:self-center">
                        <span class="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full ${uiStatus.bgColor} ${uiStatus.color}"><i class="fa-solid ${uiStatus.icon}"></i> ${uiStatus.text}</span>
                        <p class="text-sm font-bold ${uiStatus.color} mt-1">${pointsDisplay}</p>
                        ${sub.resolvedAt && sub.status !== 'pending' ? `<p class="text-xs text-zinc-500 mt-1">Resolved: ${sub.resolvedAt.toLocaleDateString('pt-BR')}</p>` : ''}
                    </div>
                </div>`; //
        }).join(''); //
    };


    // Conteúdo Principal da Aba
    const submissionContentHtml = `
        <p class="text-sm text-zinc-400 mb-6">Submit links to content you created about Backchain. Earn points and increase your multiplier.</p>
        ${statsHtml}
        ${renderSubmissionArea()} <div>
            <h3 class="text-xl font-bold mb-4 text-white mt-8 border-t border-border-color pt-6">Your Submission History</h3>
            <div id="ugc-submission-history">
                ${renderSubmissionHistory()}
            </div>
        </div>
    `; //

    // Renderiza com novo título e ícone
    el.innerHTML = renderSectionContainer('Share & Earn', 'fa-share-nodes', submissionContentHtml); //

    // --- Adiciona Listeners ---
    document.getElementById('copyReferralBtn_submitArea')?.addEventListener('click', (e) => { /* ... (lógica de copiar igual) ... */ }); //
    document.querySelector('.submitUgcLinkBtn')?.addEventListener('click', handleSubmitUgcClick); // Usa classe agora
}


// --- ABA 3: TAREFAS DIÁRIAS (Cards Clicáveis) ---
function renderDailyTasksPanel(el) {
    if (!el) return; //
     // Limpa timers? Não necessário aqui se handleTabSwitch funciona

    if (!airdropState.isConnected) { //
        const noDataHtml = renderNoData(null, 'Connect wallet to complete Daily Tasks.'); //
        el.innerHTML = renderSectionContainer('Daily Tasks', 'fa-list-check', noDataHtml); //
        return; //
    }

    // --- Renderiza Lista de Tarefas ---
     const tasksHtml = airdropState.dailyTasks.length > 0 ? airdropState.dailyTasks.map(task => { //
        if (task.error) return ``; //

        const points = Math.round(task.points); //
        const isEligible = task.eligible; //
        const expiryDate = task.endDate ? task.endDate.toLocaleDateString('pt-BR') : 'No expiry'; //

        // Determina o texto/estado inicial do status
        let statusHTML; //
        let cardClass = 'task-card-link bg-main border border-border-color rounded-lg p-5 flex flex-col md:flex-row items-start gap-4 transition-all duration-200 hover:bg-zinc-800/50 hover:border-amber-500/50 block decoration-none focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-sidebar'; //
        let statusClass = 'task-cooldown-status text-sm font-semibold px-3 py-1 rounded-md transition-colors'; // Base do status
        if (isEligible) { //
             statusHTML = task.url ? '<i class="fa-solid fa-arrow-up-right-from-square mr-1"></i> Go & Earn' : '<i class="fa-solid fa-check mr-1"></i> Earn Points'; //
             statusClass += ' text-amber-400 bg-amber-900/50 hover:bg-amber-800/50'; //
        } else { //
            statusHTML = formatTimeLeft(task.timeLeftMs); // Mostra tempo restante
            cardClass += ' task-disabled opacity-60 cursor-not-allowed'; // Desabilita card
            statusClass += ' text-zinc-400 bg-zinc-700'; // Estilo "Cooldown"
        }

        // Card da Tarefa como um link `<a>`
        return `
            <a href="${task.url || '#'}" ${task.url ? 'target="_blank" rel="noopener noreferrer"' : ''}
               class="${cardClass}"
               data-task-id="${task.id}"
               data-task-url="${task.url || ''}"
               onclick="return false;" >

                <div class="flex-grow min-w-0">
                    <h4 class="font-bold text-lg text-white truncate">${task.title}</h4>
                    <p class="text-sm text-zinc-300 mt-1">${task.description || 'Complete the required action.'}</p>
                    <div class="mt-3 flex items-center gap-4 text-xs text-zinc-500 flex-wrap">
                        <span><i class="fa-solid fa-star mr-1 text-yellow-500"></i> +${points.toLocaleString('pt-BR')} Points</span>
                        <span><i class="fa-solid fa-clock mr-1"></i> Cooldown: ${task.cooldownHours}h</span>
                        <span><i class="fa-solid fa-calendar-times mr-1"></i> Expires: ${expiryDate}</span>
                    </div>
                </div>
                <div class="flex flex-col items-center md:items-end gap-1 shrink-0 w-full md:w-auto mt-3 md:mt-0">
                    <span class="${statusClass}">
                        ${statusHTML}
                    </span>
                    <span class="text-xs text-zinc-500 mt-1">${isEligible ? 'Click to complete' : 'Cooldown active'}</span>
                </div>
            </a>
        `; //
    }).join('') : renderNoData(null, '<i class="fa-solid fa-coffee mr-2"></i> No active daily tasks right now.'); //

    // --- Conteúdo Principal da Aba ---
    const tasksContentHtml = `
        <p class="text-sm text-zinc-400 mb-6">Click on a task card to visit the link and earn points. Each task has its own cooldown period shown on the card.</p>
        <div id="tasks-content" class="space-y-4">${tasksHtml}</div>
    `; //

    el.innerHTML = renderSectionContainer('Daily Tasks', 'fa-list-check', tasksContentHtml); //

    // --- Adiciona Listener para os CARDS ---
    const tasksContentEl = document.getElementById('tasks-content'); //
    if (tasksContentEl && !tasksContentEl._listenerAttached) { //
        tasksContentEl.addEventListener('click', handleGoToTask); //
        tasksContentEl._listenerAttached = true; //
    }

    // --- Inicializa timers visuais para cooldowns existentes ---
    document.querySelectorAll('.task-card-link.task-disabled').forEach(cardLink => { //
         const taskId = cardLink.dataset.taskId; //
         const task = airdropState.dailyTasks.find(t => t.id === taskId); //
         const statusElement = cardLink.querySelector('.task-cooldown-status'); //
         if (task && !task.eligible && task.timeLeftMs > 0 && statusElement) { //
             startIndividualCooldownTimer(cardLink, statusElement, task.timeLeftMs); //
         }
    });
}


// --- ABA 4: RANKING ---
function renderLeaderboardPanel(el) {
    if (!el) return; //
     // Limpa timers de tarefa
     document.querySelectorAll('.task-card-link').forEach(card => {
        if (card._cooldownInterval) clearInterval(card._cooldownInterval); //
        card._cooldownInterval = null; //
     });

    const { leaderboards } = airdropState; //
    const topByPoints = leaderboards?.top100ByPoints || []; //
    const topByPosts = leaderboards?.top100ByPosts || []; //
    const lastUpdatedTimestamp = leaderboards?.lastUpdated; //
    let lastUpdated = 'N/A'; //
    if(lastUpdatedTimestamp) { //
        const date = lastUpdatedTimestamp.toDate ? lastUpdatedTimestamp.toDate() : new Date(lastUpdatedTimestamp); //
         try { //
             lastUpdated = date.toLocaleString('pt-BR', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }); //
         } catch (e) { console.warn("Could not format leaderboard update time:", e); } //
    }


    // --- Função para Renderizar Linhas da Tabela ---
    const renderListRow = (item, index, valueKey = 'Pts', formatFn = (val) => val?.toLocaleString('pt-BR') || '0') => { //
        const isUser = airdropState.user && item.walletAddress && airdropState.user.walletAddress?.toLowerCase() === item.walletAddress.toLowerCase(); //
        let rankClass = 'hover:bg-zinc-800/50'; // Efeito hover padrão

        // Aplica classes de destaque para Top 3
        if (index === 0) rankClass = 'bg-amber-500/20 text-yellow-300 font-extrabold hover:bg-amber-500/30'; //
        else if (index < 3) rankClass = 'bg-amber-600/10 text-amber-400 font-semibold hover:bg-amber-600/20'; //

        // Sobrescreve se for o usuário logado
        if (isUser) rankClass = 'bg-blue-900/50 text-blue-300 font-bold border-l-4 border-blue-500 hover:bg-blue-900/70'; //

        // Layout da linha
        return `
            <tr class="${rankClass} border-b border-zinc-700/50 last:border-b-0 text-sm">
                <td class="p-3 text-center font-bold w-16">${index + 1}</td>
                <td class="p-3 font-mono text-xs text-zinc-300">${formatAddress(item.walletAddress || 'Unknown')}</td>
                <td class="p-3 text-right font-bold w-32">${formatFn(item.value)} ${valueKey}</td>
            </tr>
        `; //
    };

    // --- Renderiza Tabela Completa ---
    const renderTable = (list, valueKey, formatFn) => { //
        // CORREÇÃO APLICADA AQUI: Usa o retorno de renderNoData
        if (!list || list.length === 0) { //
            return renderNoData(null, 'Leaderboard data unavailable.'); //
        }
        return `
            <div class="overflow-y-auto max-h-[600px] border border-border-color rounded-b-lg">
                <table class="w-full text-left table-fixed">
                    <thead class="sticky top-0 bg-zinc-800 z-10">
                        <tr class="text-xs text-zinc-400 uppercase border-b border-border-color">
                            <th class="p-3 text-center w-16">Rank</th>
                            <th class="p-3">Wallet</th>
                            <th class="p-3 text-right w-32">${valueKey === 'Pts' ? 'Points' : 'Posts'}</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-zinc-700/50">
                        ${list.map((item, index) => renderListRow(item, index, valueKey, formatFn)).join('')}
                    </tbody>
                </table>
            </div>
        `; //
    }

    // --- Descrição dos Prêmios NFT ---
    const nftPrizeTiers = `
        <p class="font-bold text-white mb-2 text-sm">NFT Prize Tiers (Boosters):</p>
        <ul class="list-none space-y-2 text-xs text-zinc-300">
            <li><i class="fa-solid fa-gem text-blue-400 w-4 mr-1"></i> <span class="font-bold">Rank #1:</span> Diamond Booster NFT</li>
            <li><i class="fa-solid fa-crown text-gray-300 w-4 mr-1"></i> <span class="font-bold">Ranks #2 - #3:</span> Platinum Booster NFT</li>
            <li><i class="fa-solid fa-medal text-yellow-500 w-4 mr-1"></i> <span class="font-bold">Ranks #4 - #8:</span> Gold Booster NFT</li>
            <li><i class="fa-solid fa-certificate text-gray-400 w-4 mr-1"></i> <span class="font-bold">Ranks #9 - #12:</span> Silver Booster NFT</li>
            <li><i class="fa-solid fa-award text-amber-700 w-4 mr-1"></i> <span class="font-bold">Ranks #13 - #25:</span> Bronze Booster NFT</li>
            <li><i class="fa-solid fa-user-check text-green-500 w-4 mr-1"></i> <span class="font-bold">Ranks #26+:</span> Standard Booster NFT (Tier TBD)</li>
        </ul>
    `; //


    // --- Conteúdo Principal da Aba ---
    const leaderboardContentHtml = `
        <p class="text-sm text-zinc-400 mb-6 text-center">
            <i class="fa-solid fa-sync mr-1"></i> Data Last Updated: ${lastUpdated}
        </p>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div class="bg-main border border-border-color rounded-xl shadow-lg flex flex-col">
                <div class="p-5">
                    <h3 class="text-lg font-bold mb-2 text-yellow-400 flex items-center gap-2"><i class="fa-solid fa-star"></i> Total Points Ranking</h3>
                    <p class="text-xs text-zinc-400 border-t border-zinc-700/50 pt-2">Determines your share of the main <strong class="text-white">$BKC Token Allocation</strong>.</p>
                </div>
                ${renderTable(topByPoints, 'Pts')}
            </div>

            <div class="bg-main border border-border-color rounded-xl shadow-lg flex flex-col">
                 <div class="p-5">
                    <h3 class="text-lg font-bold mb-2 text-green-400 flex items-center gap-2"><i class="fa-solid fa-file-invoice"></i> UGC Posts Ranking</h3>
                     <p class="text-xs text-zinc-400 border-t border-zinc-700/50 pt-2">Determines your eligibility for a tiered <strong class="text-white">$BKC Reward Booster NFT</strong>.</p>
                </div>
                <div class="p-4 bg-zinc-800 border-y border-zinc-700/50 mx-1 mb-0 rounded-t-md">
                     ${nftPrizeTiers} </div>
                ${renderTable(topByPosts, 'Posts', (val) => val?.toLocaleString('pt-BR') || '0')}
            </div>
        </div>
    `; //

    // Renderiza
    el.innerHTML = renderSectionContainer('Ranking & Rewards', 'fa-ranking-star', leaderboardContentHtml); //
}


// =======================================================
//  4. RENDERIZAÇÃO PRINCIPAL E EXPORTAÇÃO
// =======================================================

/**
 * Renderiza o conteúdo principal da página Airdrop, incluindo abas e o conteúdo da aba ativa.
 */
function renderAirdropContent() {
    const mainContainer = document.getElementById('airdrop'); //
    // Garante que todos os elementos base existem ou loga erro
    const loadingPlaceholder = document.getElementById('airdrop-loading-placeholder'); //
    const tabsContainer = document.getElementById('airdrop-tabs-container'); //
    const contentWrapper = document.getElementById('airdrop-content-wrapper'); //
    const activeContentEl = document.getElementById('active-tab-content'); //

    if (!mainContainer || !contentWrapper || !activeContentEl || !tabsContainer || !loadingPlaceholder) { //
        console.error("Airdrop UI containers missing! Cannot render content."); //
        if(mainContainer) mainContainer.innerHTML = "<p class='text-red-500 text-center p-8'>Error: UI components missing.</p>"; //
        return; //
    }

    // --- Mensagem de Banimento ---
    if (airdropState.isBanned) { //
        loadingPlaceholder.innerHTML = ''; //
        tabsContainer.innerHTML = ''; //
        contentWrapper.innerHTML = `
            <div class="bg-red-900/30 border border-red-500/50 rounded-xl p-8 text-center max-w-2xl mx-auto">
                <i class="fa-solid fa-ban text-5xl text-red-400 mb-4"></i>
                <h2 class="text-2xl font-bold text-white mb-2">Account Banned</h2>
                <p class="text-zinc-300">Your account has been banned from the Airdrop due to multiple policy violations. This action is irreversible.</p>
            </div>
        `; //
        return; //
    }

    loadingPlaceholder.innerHTML = ''; // Limpa loader

    // --- Renderiza Abas ---
    const getTabBtnClass = (tabName) => { //
        const baseClass = 'airdrop-tab-btn flex items-center justify-center gap-2 py-3 px-5 text-sm font-semibold transition-colors border-b-2 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-main rounded-t-md'; //
        return airdropState.activeTab === tabName //
            ? `${baseClass} border-amber-500 text-amber-400` // Ativa
            : `${baseClass} text-zinc-400 hover:text-white border-transparent hover:border-zinc-500/50`; // Inativa
    };
    // Adiciona aria-controls e id aos botões e sections para acessibilidade
    tabsContainer.innerHTML = `
        <div class="border-b border-zinc-700 mb-8">
            <nav id="airdrop-tabs" class="-mb-px flex flex-wrap gap-x-6 gap-y-1" role="tablist" aria-label="Airdrop sections">
                <button role="tab" id="tab-profile" aria-controls="panel-profile" aria-selected="${airdropState.activeTab === 'profile'}" class="${getTabBtnClass('profile')}" data-target="profile">
                    <i class="fa-solid fa-user-check fa-fw"></i> Profile
                </button>
                <button role="tab" id="tab-submissions" aria-controls="panel-submissions" aria-selected="${airdropState.activeTab === 'submissions'}" class="${getTabBtnClass('submissions')}" data-target="submissions">
                    <i class="fa-solid fa-share-nodes fa-fw"></i> Share & Earn
                </button>
                 <button role="tab" id="tab-tasks" aria-controls="panel-tasks" aria-selected="${airdropState.activeTab === 'tasks'}" class="${getTabBtnClass('tasks')}" data-target="tasks">
                    <i class="fa-solid fa-list-check fa-fw"></i> Daily Tasks
                </button>
                <button role="tab" id="tab-ranking" aria-controls="panel-ranking" aria-selected="${airdropState.activeTab === 'ranking'}" class="${getTabBtnClass('ranking')}" data-target="ranking">
                    <i class="fa-solid fa-ranking-star fa-fw"></i> Ranking
                </button>
            </nav>
        </div>
    `; //

    // Adiciona listener das abas (só uma vez)
    const tabsNav = document.getElementById('airdrop-tabs'); //
    if (tabsNav && !tabsNav._listenerAttached) { //
       tabsNav.addEventListener('click', handleTabSwitch); //
       tabsNav._listenerAttached = true; //
    }

    // --- Renderiza Conteúdo da Aba Ativa ---
    activeContentEl.innerHTML = ''; // Limpa antes de renderizar
    activeContentEl.setAttribute('role', 'tabpanel'); //
    activeContentEl.setAttribute('tabindex', '0'); // Torna focável
    activeContentEl.setAttribute('aria-labelledby', `tab-${airdropState.activeTab}`); //

    try { //
        switch (airdropState.activeTab) { //
            case 'profile': renderProfileContent(activeContentEl); break; //
            case 'submissions': renderSubmissionPanel(activeContentEl); break; //
            case 'tasks': renderDailyTasksPanel(activeContentEl); break; //
            case 'ranking': renderLeaderboardPanel(activeContentEl); break; //
            default: renderProfileContent(activeContentEl); //
        }
    } catch (error) { //
         console.error(`Error rendering tab ${airdropState.activeTab}:`, error); //
         renderError(activeContentEl, `Error loading ${airdropState.activeTab} content.`); //
    }
}


// --- Objeto Exportado da Página ---
export const AirdropPage = {
    /**
     * Ponto de entrada para renderizar/recarregar a página Airdrop.
     */
    async render() {
        const airdropEl = document.getElementById('airdrop'); //
        if (!airdropEl) { //
            console.error("Airdrop container element (#airdrop) not found in HTML."); //
            return; //
        }

        // Limpa timers antigos de cooldown das tarefas ao re-renderizar
        document.querySelectorAll('.task-card-link').forEach(card => { //
             if (card._cooldownInterval) clearInterval(card._cooldownInterval); //
             card._cooldownInterval = null; //
        });

        // --- CORREÇÃO: Pega elementos diretamente e verifica ---
        const loadingPlaceholder = document.getElementById('airdrop-loading-placeholder'); //
        const tabsContainer = document.getElementById('airdrop-tabs-container'); //
        const contentWrapper = document.getElementById('airdrop-content-wrapper'); //
        const activeContentEl = document.getElementById('active-tab-content'); //

        // Verifica se TODOS os containers essenciais foram encontrados
        if (!loadingPlaceholder || !tabsContainer || !contentWrapper || !activeContentEl) { //
             console.error("One or more essential Airdrop child elements (#airdrop-loading-placeholder, #airdrop-tabs-container, #airdrop-content-wrapper, #active-tab-content) were not found!"); //
             // Mostra um erro dentro do container principal do airdrop
             renderError(airdropEl, "UI Error: Could not load Airdrop components. Please try refreshing."); //
             return; // Interrompe a renderização
        }
        // --- FIM DA CORREÇÃO ---


        // Mostra loader principal enquanto carrega
        renderLoading(loadingPlaceholder, 'Loading Airdrop...'); //
        tabsContainer.innerHTML = ''; // Limpa abas
        activeContentEl.innerHTML = ''; // Limpa conteúdo ativo

        try { //
            // Carrega todos os dados necessários
            await loadAirdropData(); //
            // Renderiza o conteúdo principal (trata caso de banido internamente)
            renderAirdropContent(); //
        } catch (error) { //
            // Se o próprio loadAirdropData falhar criticamente
            console.error("Critical error during AirdropPage.render -> loadAirdropData:", error); //
            renderError(contentWrapper, "Failed to load critical airdrop data. Please refresh."); //
            loadingPlaceholder.innerHTML = ''; // Limpa loader se falhar
        }
    },

    /**
     * Função chamada pelo listener global quando o status da carteira muda.
     * @param {boolean} isConnected Novo status de conexão.
     */
    update(isConnected) {
        const airdropElement = document.getElementById('airdrop'); //
        // Verifica se a página está visível e se o status de conexão mudou
        const isVisible = airdropElement && !airdropElement.classList.contains('hidden'); //
        if (airdropState.isConnected !== isConnected && isVisible) { //
             console.log(`AirdropPage: Connection status changed to ${isConnected}. Reloading...`); //
             this.render(); // Re-renderiza a página completamente
        }
    }
};