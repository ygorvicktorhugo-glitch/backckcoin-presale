// pages/AdminPage.js

import { showToast } from '../ui-feedback.js';
// CORREÇÃO: Importa renderError também, caso necessário
import { renderPaginatedList, renderNoData, formatAddress, renderLoading, renderError } from '../utils.js';
import { State } from '../state.js';
// ATUALIZADO: Importa tudo de 'db', pois usaremos mais funções
import * as db from '../modules/firebase-auth-service.js';

// The administrator wallet address (security key)
const ADMIN_WALLET = "0x03aC69873293cD6ddef7625AfC91E3Bd5434562a";

// Mapeamento de Status para UI (Cores Tailwind e Ícones Font Awesome) - Reutilizado do AirdropPage
const statusUI = {
    pending: { text: 'Pending Review', color: 'text-amber-400', bgColor: 'bg-amber-900/50', icon: 'fa-clock' },
    auditing: { text: 'Auditing', color: 'text-blue-400', bgColor: 'bg-blue-900/50', icon: 'fa-magnifying-glass' },
    approved: { text: 'Approved', color: 'text-green-400', bgColor: 'bg-green-900/50', icon: 'fa-check-circle' },
    rejected: { text: 'Rejected', color: 'text-red-400', bgColor: 'bg-red-900/50', icon: 'fa-times-circle' },
    flagged_suspicious: { text: 'Flagged', color: 'text-red-300', bgColor: 'bg-red-800/60', icon: 'fa-flag' },
};


let adminState = {
    allSubmissions: [], // Submissões pendentes/auditing
    dailyTasks: [],     // Todas as tarefas (ativas e inativas)
    ugcBasePoints: null, // <-- NOVO: Para salvar os pontos base do UGC
    editingTask: null, // Tarefa sendo editada no formulário
    activeTab: 'manage-ugc-points' // <-- ATUALIZADO: Nova aba padrão
};

// --- ADMIN DATA LOADING (ATUALIZADO) ---
const loadAdminData = async () => {
    const adminContent = document.getElementById('admin-content-wrapper');
    // Mostra loader ANTES de buscar os dados
    if(adminContent) {
        const tempLoaderDiv = document.createElement('div');
        renderLoading(tempLoaderDiv); // Usa a função utilitária
        adminContent.innerHTML = tempLoaderDiv.innerHTML;
    }


    try {
        // ATUALIZADO: Busca 3 fontes de dados em paralelo
        const [submissions, tasks, publicData] = await Promise.all([
            db.getAllSubmissionsForAdmin(),
            db.getAllTasksForAdmin(),
            db.getPublicAirdropData() // <-- NOVO: Busca dados públicos
        ]);

        // A função getAllSubmissionsForAdmin já deve retornar apenas pendentes/auditing
        adminState.allSubmissions = submissions;
        adminState.dailyTasks = tasks;
        
        // NOVO: Salva os pontos base do UGC no estado, com padrões caso não existam
        adminState.ugcBasePoints = publicData.config?.ugcBasePoints || {
            'YouTube': 5000,
            'Instagram': 3000,
            'X/Twitter': 1500,
            'Other': 1000
        };


        // Se estava editando, atualiza os dados da tarefa sendo editada
        if (adminState.editingTask) {
             adminState.editingTask = tasks.find(t => t.id === adminState.editingTask.id) || null;
        }

        renderAdminPanel(); // Renderiza a UI com os dados carregados
    } catch (error) {
        console.error("Error loading admin data:", error);
        if (adminContent) {
            // Usa renderError para exibir a falha
            const tempErrorDiv = document.createElement('div');
            renderError(tempErrorDiv, `Failed to load admin data: ${error.message}`);
            adminContent.innerHTML = tempErrorDiv.innerHTML;
        } else {
             showToast("Failed to load admin data.", "error");
        }
    }
};

// --- ADMIN ACTION HANDLERS ---

const handleAdminAction = async (e) => {
    // ... (Esta função permanece exatamente a mesma) ...
    const btn = e.target.closest('button[data-action]');
    if (!btn || btn.disabled) return;

    const action = btn.dataset.action;
    const submissionId = btn.dataset.submissionId;
    const userId = btn.dataset.userId;

    if (!action || !submissionId || !userId) {
        console.warn("Missing data attributes for admin action:", btn.dataset);
        return;
    }

    const buttonCell = btn.closest('td');
    const actionButtons = buttonCell ? buttonCell.querySelectorAll('button') : [];
    actionButtons.forEach(b => b.disabled = true);
    const originalContent = btn.innerHTML;
    const tempLoaderSpan = document.createElement('span');
    tempLoaderSpan.classList.add('inline-block');
    renderLoading(tempLoaderSpan);
    btn.innerHTML = '';
    btn.appendChild(tempLoaderSpan);


    try {
        if (action === 'approve' || action === 'reject') {
             const submission = adminState.allSubmissions.find(s => s.submissionId === submissionId && s.userId === userId);
             const basePoints = submission?.basePoints || 0;
             const points = action === 'approve' ? basePoints : 0;
             const multiplier = null;

            await db.updateSubmissionStatus(userId, submissionId, action, points, multiplier);
            showToast(`Submission ${action === 'approve' ? 'APPROVED' : 'REJECTED'}!`, 'success');
            loadAdminData();
        }
    } catch(error) {
        showToast(`Failed to ${action} submission: ${error.message}`, 'error');
        console.error(error);
        actionButtons.forEach(b => b.disabled = false);
        btn.innerHTML = originalContent;
    }
};

const handleTaskFormSubmit = async (e) => {
    // ... (Esta função permanece exatamente a mesma) ...
    e.preventDefault();
    const form = e.target;

    let startDate, endDate;
    try {
        startDate = new Date(form.startDate.value + 'T00:00:00Z');
        endDate = new Date(form.endDate.value + 'T23:59:59Z');
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            throw new Error("Invalid date format.");
        }
        if (startDate >= endDate) {
            throw new Error("Start Date must be before End Date.");
        }
    } catch (dateError) {
        showToast(dateError.message, "error");
        return;
    }

    const taskData = {
        title: form.title.value.trim(),
        url: form.url.value.trim(),
        description: form.description.value.trim(),
        points: parseInt(form.points.value, 10),
        cooldownHours: parseInt(form.cooldown.value, 10),
        startDate: startDate,
        endDate: endDate
    };

    if (!taskData.title || !taskData.description) {
        showToast("Please fill in Title and Description.", "error");
        return;
    }
     if (taskData.points <= 0 || taskData.cooldownHours <= 0) {
        showToast("Points and Cooldown must be positive numbers.", "error");
        return;
    }
     if (taskData.url && !taskData.url.startsWith('http')) {
         showToast("URL must start with http:// or https://", "error");
         return;
     }


    if (adminState.editingTask && adminState.editingTask.id) {
        taskData.id = adminState.editingTask.id;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.innerHTML;
    submitButton.disabled = true;
    const tempLoaderSpan = document.createElement('span');
    tempLoaderSpan.classList.add('inline-block');
    renderLoading(tempLoaderSpan);
    submitButton.innerHTML = '';
    submitButton.appendChild(tempLoaderSpan);


    try {
        await db.addOrUpdateDailyTask(taskData);
        showToast(`Task ${taskData.id ? 'updated' : 'created'} successfully!`, 'success');
        form.reset();
        adminState.editingTask = null;
        loadAdminData();
    } catch (error) {
        showToast(`Failed to save task: ${error.message}`, "error");
        console.error(error);
         submitButton.disabled = false;
         submitButton.innerHTML = originalButtonText;
    }
};

// --- NOVO HANDLER PARA SALVAR PONTOS UGC ---
const handleUgcPointsSubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const newPoints = {
        'YouTube': parseInt(form.youtubePoints.value, 10),
        'Instagram': parseInt(form.instagramPoints.value, 10),
        'X/Twitter': parseInt(form.xTwitterPoints.value, 10),
        'Other': parseInt(form.otherPoints.value, 10)
    };
    
    // Validação simples
    if (Object.values(newPoints).some(p => isNaN(p) || p <= 0)) {
        showToast("All points must be positive numbers.", "error");
        return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.innerHTML;
    submitButton.disabled = true;
    const tempLoaderSpan = document.createElement('span');
    tempLoaderSpan.classList.add('inline-block');
    renderLoading(tempLoaderSpan);
    submitButton.innerHTML = '';
    submitButton.appendChild(tempLoaderSpan);

    try {
        // Esta é a função que precisaremos criar no firebase-auth-service.js
        await db.updateUgcBasePoints(newPoints);
        showToast("UGC Base Points updated successfully!", "success");
        adminState.ugcBasePoints = newPoints; // Atualiza o estado local
    } catch (error) {
        showToast(`Failed to update points: ${error.message}`, "error");
        console.error(error);
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = originalButtonText;
    }
};


const handleEditTask = (taskId) => {
    // ... (Esta função permanece exatamente a mesma) ...
    const task = adminState.dailyTasks.find(t => t.id === taskId);
    if (!task) return;
    adminState.editingTask = task;
    renderManageTasksPanel();
};

const handleDeleteTask = async (taskId) => {
    // ... (Esta função permanece exatamente a mesma) ...
    if (!window.confirm("Are you sure you want to delete this task permanently?")) return;
    try {
        await db.deleteDailyTask(taskId);
        showToast("Task deleted.", "success");
        adminState.editingTask = null;
        loadAdminData();
    } catch (error) {
        showToast(`Failed to delete task: ${error.message}`, "error");
        console.error(error);
    }
};

// --- ADMIN RENDER FUNCTIONS ---

// --- NOVA FUNÇÃO DE RENDERIZAÇÃO PARA PONTOS UGC ---
const renderUgcPointsPanel = () => {
    const container = document.getElementById('manage-ugc-points-content');
    if (!container) return;

    const points = adminState.ugcBasePoints;
    if (!points) {
        renderLoading(container);
        return;
    }

    // Define os valores padrão caso não estejam no banco
    const defaults = {
        'YouTube': 5000,
        'Instagram': 3000,
        'X/Twitter': 1500,
        'Other': 1000
    };

    container.innerHTML = `
        <h2 class="text-2xl font-bold mb-6">Manage UGC Base Points</h2>
        <p class="text-sm text-zinc-400 mb-6 max-w-2xl mx-auto">
            Defina os pontos base concedidos para cada plataforma de divulgação (UGC). 
            Este valor será "exportado" para a página do airdrop e é o valor usado 
            <strong>antes</strong> do multiplicador do usuário ser aplicado.
        </p>
        <form id="ugcPointsForm" class="bg-zinc-800 p-6 rounded-xl space-y-4 border border-border-color max-w-lg mx-auto">
            <div>
                <label class="block text-sm font-medium mb-1 text-zinc-300">YouTube Base Points:</label>
                <input type="number" name="youtubePoints" class="form-input" value="${points['YouTube'] || defaults['YouTube']}" required>
            </div>
            <div>
                <label class="block text-sm font-medium mb-1 text-zinc-300">Instagram Base Points:</label>
                <input type="number" name="instagramPoints" class="form-input" value="${points['Instagram'] || defaults['Instagram']}" required>
            </div>
            <div>
                <label class="block text-sm font-medium mb-1 text-zinc-300">X/Twitter Base Points:</label>
                <input type="number" name="xTwitterPoints" class="form-input" value="${points['X/Twitter'] || defaults['X/Twitter']}" required>
            </div>
            <div>
                <label class="block text-sm font-medium mb-1 text-zinc-300">Other Platform Base Points:</label>
                <input type="number" name="otherPoints" class="form-input" value="${points['Other'] || defaults['Other']}" required>
            </div>
            <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-md transition-colors shadow-md">
                <i class="fa-solid fa-save mr-2"></i>Save Base Points
            </button>
        </form>
    `;
    
    document.getElementById('ugcPointsForm')?.addEventListener('submit', handleUgcPointsSubmit);
};


const renderManageTasksPanel = () => {
    // ... (Esta função permanece exatamente a mesma) ...
    const container = document.getElementById('manage-tasks-content');
    if (!container) return;

    const task = adminState.editingTask;
    const isEditing = !!task;

    const formatDate = (dateValue) => {
        if (!dateValue) return '';
        try {
            const d = (dateValue instanceof Date) ? dateValue : new Date(dateValue);
            return d.toISOString().split('T')[0];
        } catch (e) { return ''; }
    }

    container.innerHTML = `
        <h2 class="text-2xl font-bold mb-6">${isEditing ? 'Edit Daily Task' : 'Create New Daily Task'}</h2>

        <form id="taskForm" class="bg-zinc-800 p-6 rounded-xl space-y-4 border border-border-color">
            <input type="hidden" name="id" value="${task?.id || ''}">

            <div><label class="block text-sm font-medium mb-1 text-zinc-300">Task Title:</label><input type="text" name="title" class="form-input" value="${task?.title || ''}" required></div>
            <div><label class="block text-sm font-medium mb-1 text-zinc-300">Description:</label><input type="text" name="description" class="form-input" value="${task?.description || ''}" required></div>
            <div><label class="block text-sm font-medium mb-1 text-zinc-300">Link URL (Optional):</label><input type="url" name="url" class="form-input" value="${task?.url || ''}" placeholder="https://..."></div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label class="block text-sm font-medium mb-1 text-zinc-300">Points (Base):</label><input type="number" name="points" class="form-input" value="${task?.points || 10}" min="1" required></div>
                <div><label class="block text-sm font-medium mb-1 text-zinc-300">Cooldown (Hours):</label><input type="number" name="cooldown" class="form-input" value="${task?.cooldownHours || 24}" min="1" required></div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label class="block text-sm font-medium mb-1 text-zinc-300">Start Date (UTC):</label><input type="date" name="startDate" class="form-input" value="${formatDate(task?.startDate)}" required></div>
                <div><label class="block text-sm font-medium mb-1 text-zinc-300">End Date (UTC):</label><input type="date" name="endDate" class="form-input" value="${formatDate(task?.endDate)}" required></div>
            </div>

            <button type="submit" class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-md transition-colors shadow-md">
                ${isEditing ? '<i class="fa-solid fa-save mr-2"></i>Save Changes' : '<i class="fa-solid fa-plus mr-2"></i>Create Task'}
            </button>
            ${isEditing ? `<button type="button" id="cancelEditBtn" class="w-full mt-2 bg-zinc-600 hover:bg-zinc-700 text-white font-bold py-2 rounded-md transition-colors">Cancel Edit</button>` : ''}
        </form>

        <h3 class="text-xl font-bold mt-10 mb-4 border-t border-border-color pt-6">Existing Tasks</h3>
        <div id="existing-tasks-list" class="space-y-3">
            ${adminState.dailyTasks.length > 0 ? adminState.dailyTasks.map(t => `
                <div class="bg-zinc-800 p-4 rounded-lg border border-border-color flex justify-between items-center flex-wrap gap-3">
                    <div class="flex-1 min-w-[250px]">
                        <p class="font-semibold text-white">${t.title || 'No Title'}</p>
                         <p class="text-xs text-zinc-400 mt-0.5">${t.description || 'No Description'}</p>
                        <p class="text-xs text-zinc-500 mt-1">
                           <span class="font-medium text-amber-400">${t.points || 0} Pts</span> |
                           <span class="text-blue-400">${t.cooldownHours || 0}h CD</span> |
                           Active: ${formatDate(t.startDate)} to ${formatDate(t.endDate)}
                        </p>
                        ${t.url ? `<a href="${t.url}" target="_blank" rel="noopener noreferrer" class="text-xs text-blue-400 hover:underline break-all block mt-1">${t.url}</a>` : ''}
                    </div>
                    <div class="flex gap-2 shrink-0">
                        <button data-id="${t.id}" data-action="edit" class="edit-task-btn bg-amber-600 hover:bg-amber-700 text-black text-xs font-bold py-1 px-3 rounded-md transition-colors"><i class="fa-solid fa-pencil mr-1"></i>Edit</button>
                        <button data-id="${t.id}" data-action="delete" class="delete-task-btn bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-1 px-3 rounded-md transition-colors"><i class="fa-solid fa-trash mr-1"></i>Delete</button>
                    </div>
                </div>
            `).join('') :
            (() => {
                const tempDiv = document.createElement('div');
                renderNoData(tempDiv, "No tasks created yet.");
                return tempDiv.innerHTML;
            })()
            }
        </div>
    `;

    document.getElementById('taskForm')?.addEventListener('submit', handleTaskFormSubmit);
    document.getElementById('cancelEditBtn')?.addEventListener('click', () => { adminState.editingTask = null; renderManageTasksPanel(); });

    const taskList = document.getElementById('existing-tasks-list');
    if (taskList && !taskList._listenerAttached) {
        taskList.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-id]');
            if (!btn) return;
            const taskId = btn.dataset.id;
            if (btn.dataset.action === 'edit') handleEditTask(taskId);
            if (btn.dataset.action === 'delete') handleDeleteTask(taskId);
        });
        taskList._listenerAttached = true;
    }
};


const renderSubmissionsPanel = () => {
    // ... (Esta função permanece exatamente a mesma) ...
    const container = document.getElementById('submissions-content');
    if (!container) return;

    if (!adminState.allSubmissions || adminState.allSubmissions.length === 0) {
        const tempDiv = document.createElement('div');
        renderNoData(tempDiv, 'No submissions currently pending audit.');
        container.innerHTML = tempDiv.innerHTML;
        return;
    }

    const sortedSubmissions = [...adminState.allSubmissions].sort((a, b) => (b.submittedAt?.getTime() || 0) - (a.submittedAt?.getTime() || 0));


    const submissionsHtml = sortedSubmissions.map(item => `
        <tr class="border-b border-border-color hover:bg-zinc-800/50">
            <td class="p-3 text-xs text-zinc-400 font-mono" title="${item.userId}">${formatAddress(item.walletAddress)}</td>
            <td class="p-3 text-sm max-w-xs truncate" title="${item.url}">
                <a href="${item.url}" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:underline">${item.url}</a>
                <span class="block text-xs text-zinc-500">${item.platform || 'N/A'} - ${item.basePoints || 0} base pts</span>
            </td>
            <td class="p-3 text-xs text-zinc-400">${item.submittedAt ? item.submittedAt.toLocaleString() : 'N/A'}</td>
            <td class="p-3 text-xs font-semibold ${statusUI[item.status]?.color || 'text-gray-500'}">${statusUI[item.status]?.text || item.status}</td>
            <td class="p-3 text-right">
                <div class="flex items-center justify-end gap-2">
                    <button data-user-id="${item.userId}" data-submission-id="${item.submissionId}" data-action="approve" class="bg-green-600 hover:bg-green-700 text-white text-xs font-bold py-1 px-2 rounded transition-colors"><i class="fa-solid fa-check"></i></button>
                    <button data-user-id="${item.userId}" data-submission-id="${item.submissionId}" data-action="reject" class="bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-1 px-2 rounded transition-colors ml-1"><i class="fa-solid fa-times"></i></button>
                </div>
            </td>
        </tr>
    `).join('');

    container.innerHTML = `
        <h2 class="text-2xl font-bold mb-6">Review Pending Submissions (${sortedSubmissions.length})</h2>
        <div class="bg-zinc-800 rounded-xl border border-border-color overflow-x-auto">
            <table class="w-full text-left min-w-[700px]">
                <thead>
                    <tr class="bg-main border-b border-border-color text-xs text-zinc-400 uppercase">
                        <th class="p-3 font-semibold">Wallet</th>
                        <th class="p-3 font-semibold">Link & Platform</th>
                        <th class="p-3 font-semibold">Submitted</th>
                        <th class="p-3 font-semibold">Status</th>
                        <th class="p-3 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody id="admin-submissions-tbody">${submissionsHtml}</tbody>
            </table>
        </div>
    `;

     const tbody = document.getElementById('admin-submissions-tbody');
     if (tbody && !tbody._listenerAttached) {
        tbody.addEventListener('click', handleAdminAction);
        tbody._listenerAttached = true;
     }
};


const renderAdminPanel = () => {
    // ... (Esta função foi ATUALIZADA) ...
    const adminContent = document.getElementById('admin-content-wrapper');
    if (!adminContent) return;

    adminContent.innerHTML = `
        <h1 class="text-3xl font-bold mb-8">Airdrop Admin Panel</h1>

        <div class="border-b border-border-color mb-6">
            <nav id="admin-tabs" class="-mb-px flex gap-6">
                <button class="tab-btn ${adminState.activeTab === 'manage-ugc-points' ? 'active' : ''}" data-target="manage-ugc-points">Manage UGC Points</button>
                <button class="tab-btn ${adminState.activeTab === 'manage-tasks' ? 'active' : ''}" data-target="manage-tasks">Manage Daily Tasks</button>
                <button class="tab-btn ${adminState.activeTab === 'review-submissions' ? 'active' : ''}" data-target="review-submissions">Review Submissions</button>
            </nav>
        </div>

        <div id="manage_ugc_points_tab" class="tab-content ${adminState.activeTab === 'manage-ugc-points' ? 'active' : ''}">
            <div id="manage-ugc-points-content" class="max-w-4xl mx-auto"></div>
        </div>

        <div id="manage_tasks_tab" class="tab-content ${adminState.activeTab === 'manage-tasks' ? 'active' : ''}">
            <div id="manage-tasks-content" class="max-w-4xl mx-auto"></div>
        </div>

        <div id="review_submissions_tab" class="tab-content ${adminState.activeTab === 'review-submissions' ? 'active' : ''}">
            <div id="submissions-content" class="max-w-7xl mx-auto"></div>
        </div>
    `;

    // Renderiza o conteúdo da aba ativa inicial
    if (adminState.activeTab === 'manage-ugc-points') {
        renderUgcPointsPanel();
    } else if (adminState.activeTab === 'manage-tasks') {
        renderManageTasksPanel();
    } else if (adminState.activeTab === 'review-submissions') {
        renderSubmissionsPanel();
    }

    const adminTabs = document.getElementById('admin-tabs');
    // Adiciona listener apenas uma vez
    if (adminTabs && !adminTabs._listenerAttached) {
        adminTabs.addEventListener('click', (e) => {
            const button = e.target.closest('.tab-btn');
            if (!button || button.classList.contains('active')) return;
            const targetId = button.dataset.target;
            adminState.activeTab = targetId; // Atualiza o estado da aba ativa

            document.querySelectorAll('#admin-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            adminContent.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            const targetTabElement = document.getElementById(targetId.replace(/-/g, '_') + '_tab'); // Corrigido para substituir todos os hífens

            if (targetTabElement) {
                 targetTabElement.classList.add('active');
                 
                 // ATUALIZADO: Chama a nova função de renderização
                 if (targetId === 'manage-ugc-points') renderUgcPointsPanel();
                 if (targetId === 'manage-tasks') renderManageTasksPanel();
                 if (targetId === 'review-submissions') renderSubmissionsPanel();
            } else {
                 console.warn(`Tab content not found for target: ${targetId}`);
            }
        });
        adminTabs._listenerAttached = true;
    }
};


export const AdminPage = {
    render() {
        // ... (Esta função permanece exatamente a mesma) ...
        const adminContainer = document.getElementById('admin');
        if (!adminContainer) return;

        if (!State.isConnected || !State.userAddress || State.userAddress.toLowerCase() !== ADMIN_WALLET.toLowerCase()) {
            adminContainer.innerHTML = `<div class="text-center text-red-400 p-8 bg-sidebar border border-red-500/50 rounded-lg">Access Denied. This page is restricted to administrators.</div>`;
            return;
        }

        adminContainer.innerHTML = `<div id="admin-content-wrapper"></div>`;
        loadAdminData();
    },

     refreshData() {
         // ... (Esta função permanece exatamente a mesma) ...
         const adminContainer = document.getElementById('admin');
         if (adminContainer && !adminContainer.classList.contains('hidden')) {
             console.log("Refreshing Admin Page data...");
             loadAdminData();
         }
     }
};