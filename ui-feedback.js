// ui-feedback.js - Versão Otimizada (Single Timer Loop)

import { DOMElements } from './dom-elements.js';
import { addresses } from './config.js';
import { State } from './state.js';

// Gerenciamento de Timers e Flags de Exibição
let activeTimerElements = []; // Array de elementos ativos
let globalTimerInterval = null; // Único intervalo global
let hasShownIntroModal = false;
let hasShownWelcomeModal = false; 

// --- INTERNACIONALIZAÇÃO (i18n) ---
let currentLang = 'en';

const translations = {
    'pt': {
        'welcome_name': 'Backcoin.org',
        'welcome_slogan': 'O futuro é descentralizado',
        'welcome_subtitle_strategic': 'Participe da Revolução Web3',
        'welcome_description_strategic': 'Um ecossistema de ações descentralizadas: gere pStake ao delegar $BKC, ganhe recompensas por taxas de serviço e garanta a segurança da rede.',
        'welcome_presale_btn': 'Adquirir Booster NFT (Pré-venda)',
        'welcome_testnet_btn': 'Explorar Rede de Testes', 
        'welcome_airdrop_btn': 'Participar do Airdrop Gratuito',
        'welcome_explore_btn': 'Explore o Ecossistema (Dashboard)', 
        'timer_unlocked': 'Desbloqueado',
        'timer_fee_text': 'Taxa de Saque: 1% (Padrão)',
        'intro_title': 'Participe. Ganhe. Apoie.',
        'intro_desc': 'A Backchain é um ecossistema de Ações Descentralizadas. Sua participação é transparente, segura e recompensadora.',
        'intro_feat1_title': 'Apoie o Crescimento da Rede',
        'intro_feat1_desc': 'Seu stake de $BKC contribui para a liquidez e estabilidade da rede.',
        'intro_feat2_title': 'Ganhe em Sorteios On-Chain',
        'intro_feat2_desc': 'Participe de sorteios com justiça verificável diretamente na blockchain.',
        'intro_feat3_title': 'Apoie Causas Sociais',
        'intro_feat3_desc': 'Ações de Caridade com transparência total e rastreabilidade.',
        'intro_understand_btn': 'Entendi, Continuar',
        'share_title': 'Compartilhe o Projeto',
        'share_desc': 'Ajude a revolução a crescer! Compartilhe com seus amigos e comunidade.',
        'share_copy_link_label': 'Ou copie o link diretamente:',
        'share_copy_btn': 'Copiar',
        'share_copied_toast': 'Link copiado!',
        'share_text': 'Estou acompanhando a Backchain! 💎 Um novo projeto de rede descentralizada que pode ser o próximo Bitcoin. Não perca a revolução! #Backchain #Web3 #Crypto',
        'ugc_title': 'Submeta sua Publicação no ', 
        'ugc_instructions_title': 'Instruções Importantes',
        'ugc_inst1_title': 'Link de Referência:',
        'ugc_inst1_desc': 'Certifique-se de incluir seu link de referência único (copiado abaixo).',
        'ugc_inst2_title': 'Hashtags:',
        'ugc_inst2_desc': 'Use as hashtags relevantes fornecidas.',
        'ugc_inst3_title': 'Conteúdo:',
        'ugc_inst3_desc': 'O post deve ser sobre a Backchain (notícias, artigos, canais oficiais).',
        'ugc_text_label': 'Texto Sugerido (Link e Hashtags)',
        'ugc_copy_text_btn': 'Copiar Texto para Publicação',
        'ugc_url_label': 'URL da sua publicação no ', 
        'ugc_submit_btn': 'Submeter para Auditoria',
        'ugc_cancel_btn': 'Cancelar',
        'ugc_copied_toast': 'Texto Copiado!',
        'ugc_invalid_url_toast': 'Por favor, insira uma URL válida (iniciada com http/https).',
        'toast_nft_adding': 'Adicionando NFT #%s à sua carteira...',
        'toast_nft_added': 'NFT #%s adicionado com sucesso!',
        'toast_nft_canceled': 'Ação cancelada pelo usuário.',
        'toast_nft_error': 'Erro ao adicionar NFT: %s',
        'toast_no_wallet': 'Nenhuma carteira Ethereum detectada.',
    },
    'en': {
        'welcome_name': 'Backcoin.org',
        'welcome_slogan': 'The future is decentralized',
        'welcome_subtitle_strategic': 'Join the Web3 Revolution',
        'welcome_description_strategic': 'A decentralized actions ecosystem: generate pStake by delegating $BKC, earn rewards from service fees, and guarantee network security.',
        'welcome_presale_btn': 'Acquire Booster NFT (Presale)',
        'welcome_testnet_btn': 'Explore Testnet Network', 
        'welcome_airdrop_btn': 'Participate in the Free Airdrop',
        'welcome_explore_btn': 'Explore the Ecosystem (Dashboard)', 
        'timer_unlocked': 'Unlocked',
        'timer_fee_text': 'Unstake Fee: 1% (Default)',
        'intro_title': 'Participate. Earn. Support.',
        'intro_desc': 'Backchain is an ecosystem of Decentralized Actions. Your participation is transparent, secure, and rewarding.',
        'intro_feat1_title': 'Support Network Growth',
        'intro_feat1_desc': 'Your $BKC stake contributes to the network\'s liquidity and stability.',
        'intro_feat2_title': 'Earn in On-Chain Lotteries',
        'intro_feat2_desc': 'Participate in lotteries with verifiable fairness directly on the blockchain.',
        'intro_feat3_title': 'Champion Social Causes',
        'intro_feat3_desc': 'Charity Actions with total transparency and traceability.',
        'intro_understand_btn': 'I Understand, Continue',
        'share_title': 'Share the Project',
        'share_desc': 'Help the revolution grow! Share with your friends and community.',
        'share_copy_link_label': 'Or copy the link directly:',
        'share_copy_btn': 'Copy',
        'share_copied_toast': 'Link copied!',
        'share_text': 'I\'m following Backchain! 💎 A new decentralized network project that could be the next Bitcoin. Don\'t miss the revolution! #Backchain #Web3 #Crypto',
        'ugc_title': 'Submit Your Post on ', 
        'ugc_instructions_title': 'Important Instructions',
        'ugc_inst1_title': 'Referral Link:',
        'ugc_inst1_desc': 'Ensure you include your unique referral link (copied below).',
        'ugc_inst2_title': 'Hashtags:',
        'ugc_inst2_desc': 'Use the relevant hashtags provided.',
        'ugc_inst3_title': 'Content:',
        'ugc_inst3_desc': 'The post must be about Backchain (news, articles, or official channels).',
        'ugc_text_label': 'Suggested Text (Link and Hashtags)',
        'ugc_copy_text_btn': 'Copy Text for Posting',
        'ugc_url_label': 'URL of your post on ', 
        'ugc_submit_btn': 'Submit for Audit',
        'ugc_cancel_btn': 'Cancel',
        'ugc_copied_toast': 'Text Copied!',
        'ugc_invalid_url_toast': 'Please enter a valid URL (starting with http/https).',
        'toast_nft_adding': 'Adding NFT #%s to your wallet...',
        'toast_nft_added': 'NFT #%s added successfully!',
        'toast_nft_canceled': 'Action canceled by the user.',
        'toast_nft_error': 'Error adding NFT: %s',
        'timer_unlocked': 'Unlocked',
        'timer_fee_text': 'Unstake Fee: 1% (Default)',
    },
    'es': {
        'welcome_name': 'Backcoin.org',
        'welcome_slogan': 'El futuro es descentralizado',
        'welcome_subtitle_strategic': 'Únete a la Revolución Web3',
        'welcome_description_strategic': 'Un ecosistema de acciones descentralizadas: genera pStake al delegar $BKC, gana recompensas por tarifas de servicio y garantiza la seguridad de la red.',
        'welcome_presale_btn': 'Adquirir Booster NFT (Preventa)',
        'welcome_testnet_btn': 'Explorar Red de Pruebas', 
        'welcome_airdrop_btn': 'Participar en el Airdrop Gratuito',
        'welcome_explore_btn': 'Explorar el Ecosistema (Dashboard)', 
        'timer_unlocked': 'Desbloqueado',
        'timer_fee_text': 'Tarifa de Retiro: 1% (Predeterminado)',
        'intro_title': 'Participa. Gana. Apoya.',
        'intro_desc': 'Backchain es un ecosistema de Acciones Descentralizadas. Tu participación es transparente, segura y gratificante.',
        'intro_feat1_title': 'Apoya el Crecimiento de la Red',
        'intro_feat1_desc': 'Tu stake de $BKC contribuye a la liquidez y estabilidad de la red.',
        'intro_feat2_title': 'Gana en Loterías On-Chain',
        'intro_feat2_desc': 'Participa en loterías con justicia verificable directamente en la blockchain.',
        'intro_feat3_title': 'Apoya Causas Sociales',
        'intro_feat3_desc': 'Acciones de Caridad con total transparencia y trazabilidad.',
        'intro_understand_btn': 'Entendido, Continuar',
        'share_title': 'Comparte el Proyecto',
        'share_desc': '¡Ayuda a que la revolución crezca! Comparte con tus amigos y comunidad.',
        'share_copy_link_label': 'O copia el enlace directamente:',
        'share_copy_btn': 'Copiar',
        'share_copied_toast': '¡Enlace copiado!',
        'share_text': '¡Estoy siguiendo Backchain! 💎 Un nuevo proyecto de red descentralizada que podría ser el próximo Bitcoin. ¡No te pierdas la revolución! #Backchain #Web3 #Crypto',
        'ugc_title': 'Envía tu Publicación en ', 
        'ugc_instructions_title': 'Instrucciones Importantes',
        'ugc_inst1_title': 'Enlace de Referencia:',
        'ugc_inst1_desc': 'Asegúrate de incluir tu enlace de referencia único (copiado abajo).',
        'ugc_inst2_title': 'Hashtags:',
        'ugc_inst2_desc': 'Usa los hashtags relevantes proporcionados.',
        'ugc_inst3_title': 'Contenido:',
        'ugc_inst3_desc': 'La publicación debe ser sobre Backchain (noticias, artículos o canales oficiales).',
        'ugc_text_label': 'Texto Sugerido (Enlace e Hashtags)',
        'ugc_copy_text_btn': 'Copiar Texto para Publicación',
        'ugc_url_label': 'URL de tu publicación en ', 
        'ugc_submit_btn': 'Enviar para Auditoría',
        'ugc_cancel_btn': 'Cancelar',
        'ugc_copied_toast': '¡Texto Copiado!',
        'ugc_invalid_url_toast': 'Por favor, introduce una URL válida (que empiece por http/https).',
        'toast_nft_adding': 'Añadiendo NFT #%s a tu cartera...',
        'toast_nft_added': '¡NFT #%s añadido con éxito!',
        'toast_nft_canceled': 'Acción cancelada por el usuario.',
        'toast_nft_error': 'Error al añadir NFT: %s',
        'timer_unlocked': 'Desbloqueado',
        'timer_fee_text': 'Tarifa de Retiro: 1% (Predeterminado)',
    }
};

const getTranslation = (key, args = []) => {
    let text = translations[currentLang][key] || translations['pt'][key] || key;
    args.forEach(arg => {
        text = text.replace('%s', arg);
    });
    return text;
};

export const setLanguage = (lang) => {
    if (translations[lang]) {
        currentLang = lang;
        console.log(`Idioma alterado para: ${lang}`);
        const modalBackdrop = document.getElementById('modal-backdrop');
        if (modalBackdrop && modalBackdrop.querySelector('.lang-selector')) {
            closeModal(); 
            setTimeout(showWelcomeModal, 350); 
        }
    }
};

// --- FUNÇÕES BÁSICAS DE UI ---

export const showToast = (message, type = 'info', txHash = null) => {
    if (!DOMElements.toastContainer) return;

    const definitions = {
        success: { icon: 'fa-check-circle', color: 'bg-green-600', border: 'border-green-400' },
        error: { icon: 'fa-exclamation-triangle', color: 'bg-red-600', border: 'border-red-400' },
        info: { icon: 'fa-info-circle', color: 'bg-blue-600', border: 'border-blue-400' }
    };
    const def = definitions[type] || definitions.info;

    const toast = document.createElement('div');
    toast.className = `flex items-center w-full max-w-xs p-3 text-white rounded-lg shadow-2xl transition-all duration-500 ease-out 
                         transform translate-x-full opacity-0 
                         ${def.color} border-l-4 ${def.border}`;

    let content = `
        <div class="flex items-center flex-1">
            <i class="fa-solid ${def.icon} text-lg mr-3"></i>
            <div class="text-sm font-medium">${message}</div>
        </div>
    `;

    if (txHash) {
        const explorerUrl = `https://sepolia.etherscan.io/tx/${txHash}`;
        content += `<a href="${explorerUrl}" target="_blank" title="View on Etherscan" class="ml-3 flex-shrink-0 text-zinc-200 hover:text-white transition-colors">
                        <i class="fa-solid fa-arrow-up-right-from-square text-sm"></i>
                      </a>`;
    }
    
    content += `<button class="ml-3 text-zinc-200 hover:text-white transition-colors" onclick="this.closest('.shadow-2xl').remove()">
                    <i class="fa-solid fa-xmark"></i>
                </button>`;

    toast.innerHTML = content;
    DOMElements.toastContainer.appendChild(toast);

    setTimeout(() => { 
        toast.classList.remove('translate-x-full', 'opacity-0'); 
        toast.classList.add('translate-x-0', 'opacity-100'); 
    }, 50);

    setTimeout(() => { 
        toast.classList.remove('translate-x-0', 'opacity-100');
        toast.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => toast.remove(), 500);
    }, 5000);
};

export const closeModal = () => { 
    if (!DOMElements.modalContainer) return;
    const backdrop = document.getElementById('modal-backdrop');
    if (backdrop) {
        const content = document.getElementById('modal-content');
        if (content) {
            content.classList.remove('animate-fade-in-up');
            content.classList.add('animate-fade-out-down');
        }
        backdrop.classList.add('opacity-0');
        setTimeout(() => {
            DOMElements.modalContainer.innerHTML = '';
        }, 300); 
    }
};

export const openModal = (content, maxWidth = 'max-w-md', allowCloseOnBackdrop = true) => {
    if (!DOMElements.modalContainer) return;
    
    const style = 
        '<style>' +
            '@keyframes fade-in-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }' +
            '@keyframes fade-out-down { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(20px); } }' +
            '.animate-fade-in-up { animation: fade-in-up 0.3s ease-out forwards; }' +
            '.animate-fade-out-down { animation: fade-out-down 0.3s ease-in forwards; }' +
        '</style>';

    const modalHTML = `
        <div id="modal-backdrop" class="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity duration-300">
            <div id="modal-content" class="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full ${maxWidth} shadow-2xl animate-fade-in-up max-h-full overflow-y-auto">
                ${content}
            </div>
        </div>
        ${style}
    `;
    
    DOMElements.modalContainer.innerHTML = modalHTML;

    document.getElementById('modal-backdrop')?.addEventListener('click', e => {
        if (allowCloseOnBackdrop && e.target.id === 'modal-backdrop') {
            closeModal();
        }
    });

    document.getElementById('modal-content')?.querySelectorAll('.closeModalBtn').forEach(btn => {
        btn.addEventListener('click', closeModal);
    });
};

// --- OTIMIZAÇÃO DE TIMER (Single Loop) ---

const updateAllTimers = () => {
    const now = Math.floor(Date.now() / 1000);
    
    // Filtra e remove timers concluídos do array
    activeTimerElements = activeTimerElements.filter(el => {
        // Se o elemento foi removido do DOM, remove da lista
        if (!document.body.contains(el)) return false;

        const unlockTime = parseInt(el.dataset.unlockTime, 10);
        const remaining = unlockTime - now;

        if (remaining <= 0) {
            el.innerHTML = `<span class="text-green-500 font-semibold flex items-center"><i class="fa-solid fa-lock-open mr-1"></i> ${getTranslation('timer_unlocked')}</span>`;
            
            const parentCard = el.closest('.delegation-card');
            if (parentCard) {
                parentCard.querySelector('.force-unstake-btn')?.remove();
                parentCard.querySelector('.unstake-btn')?.classList.remove('btn-disabled', 'opacity-50', 'cursor-not-allowed');
                parentCard.querySelector('.unstake-btn')?.removeAttribute('disabled');
                const penaltyTextEl = parentCard.querySelector('.delegation-penalty-text');
                if (penaltyTextEl) {
                    penaltyTextEl.textContent = getTranslation('timer_fee_text');
                    penaltyTextEl.classList.remove('text-red-400/80');
                    penaltyTextEl.classList.add('text-green-500');
                }
            }
            return false; // Remove da lista ativa
        }

        const days = Math.floor(remaining / 86400);
        const hours = Math.floor((remaining % 86400) / 3600);
        const minutes = Math.floor((remaining % 3600) / 60);
        const seconds = remaining % 60;

        el.innerHTML = `
            <div class="flex items-center space-x-1 font-mono text-sm">
                <span class="text-amber-400">${String(days).padStart(2, '0')}d</span>
                <span class="text-zinc-500">:</span>
                <span class="text-amber-400">${String(hours).padStart(2, '0')}h</span>
                <span class="text-zinc-500">:</span>
                <span class="text-amber-400">${String(minutes).padStart(2, '0')}m</span>
                <span class="text-zinc-500">:</span>
                <span class="text-amber-400">${String(seconds).padStart(2, '0')}s</span>
            </div>`;
        return true; // Mantém na lista
    });

    // Se não houver mais timers, limpa o intervalo global
    if (activeTimerElements.length === 0 && globalTimerInterval) {
        clearInterval(globalTimerInterval);
        globalTimerInterval = null;
    }
};

export const startCountdownTimers = (elements) => {
    // Adiciona novos elementos à lista global
    elements.forEach(el => {
        if(!activeTimerElements.includes(el)) {
            activeTimerElements.push(el);
        }
    });

    // Inicia o loop global se não estiver rodando
    if (!globalTimerInterval && activeTimerElements.length > 0) {
        updateAllTimers(); // Atualiza imediatamente
        globalTimerInterval = setInterval(updateAllTimers, 1000);
    }
};

// --- FUNÇÕES DE CARTEIRA ---

export async function addNftToWallet(contractAddress, tokenId) {
    if (!tokenId || !window.ethereum) {
        showToast(getTranslation('toast_no_wallet'), 'error');
        return;
    }
    try {
        showToast(getTranslation('toast_nft_adding', [tokenId]), 'info');
        const wasAdded = await window.ethereum.request({ 
            method: 'wallet_watchAsset', 
            params: { 
                type: 'ERC721', 
                options: { 
                    address: contractAddress, 
                    tokenId: tokenId.toString() 
                } 
            } 
        });
        if(wasAdded) {
            showToast(getTranslation('toast_nft_added', [tokenId]), 'success');
        } else {
            showToast(getTranslation('toast_nft_canceled'), 'info');
        }
    } catch (error) { 
        console.error(error); 
        showToast(getTranslation('toast_nft_error', [error.message]), 'error');
    }
}

// --- MODAIS (Intro, Share, UGC, Welcome) Mantidos conforme seu código original (apenas tradução aplicada) ---
// ... (Mantendo a lógica de showIntroModal, showShareModal, openUgcSubmitModal, showWelcomeModal inalterada) ...

export function showIntroModal() {
    if (hasShownIntroModal) return;
    // ... (Conteúdo igual ao original, usando getTranslation)
    // ...
    const introContent = `
        <div class="space-y-4">
            <h3 class="text-2xl font-extrabold text-amber-400 mb-4 border-b border-zinc-700 pb-2">${getTranslation('intro_title')}</h3>
            <p class="text-zinc-300">${getTranslation('intro_desc')}</p>
            <ul class="space-y-4">
                <li class="flex items-start p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
                    <i class="fa-solid fa-handshake text-green-400 mt-1 mr-3 flex-shrink-0 text-xl"></i>
                    <div><strong class="text-white block text-lg">${getTranslation('intro_feat1_title')}</strong><span class="text-zinc-400 text-sm">${getTranslation('intro_feat1_desc')}</span></div>
                </li>
                <li class="flex items-start p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
                    <i class="fa-solid fa-trophy text-yellow-400 mt-1 mr-3 flex-shrink-0 text-xl"></i>
                    <div><strong class="text-white block text-lg">${getTranslation('intro_feat2_title')}</strong><span class="text-zinc-400 text-sm">${getTranslation('intro_feat2_desc')}</span></div>
                </li>
                <li class="flex items-start p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
                    <i class="fa-solid fa-heart text-red-400 mt-1 mr-3 flex-shrink-0 text-xl"></i>
                    <div><strong class="text-white block text-lg">${getTranslation('intro_feat3_title')}</strong><span class="text-zinc-400 text-sm">${getTranslation('intro_feat3_desc')}</span></div>
                </li>
            </ul>
        </div>
        <div class="mt-6 flex justify-end">
            <button class="bg-amber-500 hover:bg-amber-600 text-zinc-900 font-bold py-2.5 px-6 rounded-lg transition-colors closeModalBtn shadow-lg">${getTranslation('intro_understand_btn')}</button>
        </div>
    `;
    openModal(introContent, 'max-w-xl');
    hasShownIntroModal = true;
}

export function showShareModal() {
    const projectUrl = window.location.origin;
    const copyText = getTranslation('share_text'); 
    const encodedUrl = encodeURIComponent(projectUrl);
    const encodedText = encodeURIComponent(copyText + " " + projectUrl); 
    const encodedTwitterText = encodeURIComponent(copyText); 

    const content = `
        <div class="flex justify-between items-start mb-6 border-b border-zinc-700 pb-4">
            <h3 class="text-2xl font-bold text-white">${getTranslation('share_title')}</h3>
            <button class="closeModalBtn text-zinc-400 hover:text-white text-3xl leading-none">&times;</button>
        </div>
        <p class="text-zinc-300 mb-8 text-center">${getTranslation('share_desc')}</p>
        <div class="grid grid-cols-3 gap-4 text-center">
            <a href="https://twitter.com/intent/tweet?text=${encodedTwitterText}&url=${encodedUrl}" target="_blank" class="share-link-btn bg-blue-500 hover:bg-blue-600 p-4 rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg">
                <i class="fa-brands fa-twitter fa-3x mb-2"></i><span class="font-semibold text-lg">X</span>
            </a>
            <a href="https://t.me/share/url?url=${encodedUrl}&text=${encodedText}" target="_blank" class="share-link-btn bg-sky-500 hover:bg-sky-600 p-4 rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg">
                <i class="fa-brands fa-telegram fa-3x mb-2"></i><span class="font-semibold text-lg">Telegram</span>
            </a>
            <a href="https://api.whatsapp.com/send?text=${encodedText}" target="_blank" class="share-link-btn bg-green-500 hover:bg-green-600 p-4 rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg">
                <i class="fa-brands fa-whatsapp fa-3x mb-2"></i><span class="font-semibold text-lg">WhatsApp</span>
            </a>
        </div>
        <div class="mt-8 pt-4 border-t border-zinc-800">
            <label class="text-sm font-medium text-zinc-400 block mb-2">${getTranslation('share_copy_link_label')}</label>
            <div class="flex gap-2">
                <input type="text" id="shareLinkInput" value="${projectUrl}" readonly class="flex-1 p-3 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 font-mono focus:border-amber-500 focus:ring-amber-500">
                <button id="copyShareLinkBtn" class="bg-amber-500 hover:bg-amber-600 text-zinc-900 font-bold py-3 px-5 rounded-lg transition-colors flex items-center justify-center shadow-md">
                    <i class="fa-solid fa-copy text-lg"></i>
                </button>
            </div>
        </div>
    `;
    openModal(content, 'max-w-2xl');
    document.getElementById('copyShareLinkBtn')?.addEventListener('click', (e) => {
        const input = document.getElementById('shareLinkInput');
        const button = e.currentTarget;
        input.select();
        navigator.clipboard.writeText(input.value).then(() => {
            const originalIcon = button.innerHTML;
            button.innerHTML = '<i class="fa-solid fa-check text-lg"></i>';
            showToast(getTranslation('share_copied_toast'), 'success');
            setTimeout(() => { button.innerHTML = originalIcon; }, 1500);
        });
    });
}

export function openUgcSubmitModal(platform, referralLink, shareText, onSubmit) {
    const content = `
        <div class="flex justify-between items-start mb-6 border-b border-zinc-700 pb-4">
            <h3 class="text-2xl font-bold text-white">${getTranslation('ugc_title')}${platform}</h3>
            <button class="closeModalBtn text-zinc-400 hover:text-white text-3xl leading-none">&times;</button>
        </div>
        <div class="bg-zinc-800/50 border border-blue-600/50 rounded-xl p-5 mb-6 space-y-4">
             <p class="text-lg text-blue-400 font-semibold flex items-center"><i class="fa-solid fa-lightbulb mr-3 text-2xl"></i>${getTranslation('ugc_instructions_title')}</p>
             <ul class="list-disc list-inside text-zinc-300 space-y-2 pl-4">
                 <li><strong class="text-white">${getTranslation('ugc_inst1_title')}</strong> ${getTranslation('ugc_inst1_desc')}</li>
                 <li><strong class="text-white">${getTranslation('ugc_inst2_title')}</strong> ${getTranslation('ugc_inst2_desc')}</li>
                 <li><strong class="text-white">${getTranslation('ugc_inst3_title')}</strong> ${getTranslation('ugc_inst3_desc')}</li>
             </ul>
        </div>
        <div class="mb-6">
            <label class="block text-sm font-medium text-zinc-400 mb-2">${getTranslation('ugc_text_label')}</label>
            <textarea id="ugcShareText" rows="4" readonly class="w-full p-3 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 font-mono resize-none">${shareText}</textarea>
            <button id="copyShareTextBtn" class="mt-3 text-sm bg-zinc-700 hover:bg-zinc-600 text-white font-semibold rounded-lg px-4 py-2 w-full transition-colors">
                <i class="fa-solid fa-copy mr-2"></i> ${getTranslation('ugc_copy_text_btn')}
            </button>
        </div>
        <div class="mb-8">
            <label for="ugcPostUrlInput" class="block text-lg font-medium text-white mb-2">${getTranslation('ugc_url_label')}${platform}:</label>
            <input type="url" id="ugcPostUrlInput" required placeholder="https://..." class="w-full p-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:border-amber-500 focus:ring-amber-500">
        </div>
        <div class="flex gap-4">
            <button id="confirmUgcSubmitBtn" class="bg-amber-500 hover:bg-amber-600 text-zinc-900 font-bold py-3 px-6 rounded-lg transition-colors flex-1 text-lg shadow-lg">
                <i class="fa-solid fa-paper-plane mr-2"></i> ${getTranslation('ugc_submit_btn')}
            </button>
            <button class="bg-zinc-700 hover:bg-zinc-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors closeModalBtn">
                <i class="fa-solid fa-xmark mr-2"></i> ${getTranslation('ugc_cancel_btn')}
            </button>
        </div>
    `;
    openModal(content, 'max-w-xl'); 
    document.getElementById('copyShareTextBtn')?.addEventListener('click', (e) => {
        const textarea = document.getElementById('ugcShareText');
        const button = e.currentTarget;
        textarea.select();
        navigator.clipboard.writeText(textarea.value).then(() => {
            const originalText = button.innerHTML;
            button.innerHTML = `<i class="fa-solid fa-check mr-2"></i> ${getTranslation('ugc_copied_toast')}`;
            showToast(getTranslation('ugc_copied_toast'), 'success');
            setTimeout(() => { button.innerHTML = originalText; }, 1500);
        });
    });
    document.getElementById('confirmUgcSubmitBtn')?.addEventListener('click', () => {
        const urlInput = document.getElementById('ugcPostUrlInput');
        const url = urlInput.value.trim();
        if (url && url.startsWith('http')) {
            onSubmit(url); 
        } else {
            showToast(getTranslation('ugc_invalid_url_toast'), 'error');
            urlInput.focus();
        }
    });
}

function renderLanguageSelectors() {
    const langs = [
        { code: 'en', text: 'English', img: './assets/en.png' }, 
        { code: 'pt', text: 'Português', img: './assets/pt.png' }, 
        { code: 'es', text: 'Español', img: './assets/es.png' }
    ];
    const activeClass = 'ring-2 ring-amber-500 scale-110 opacity-100';
    const inactiveClass = 'opacity-70 hover:opacity-100';
    return `
        <div class="flex justify-center space-x-3 mb-6">
            ${langs.map(lang => `
                <button class="lang-selector p-1.5 rounded-full transition-all duration-200 ${lang.code === currentLang ? activeClass : inactiveClass}" data-lang="${lang.code}" title="${lang.text}">
                    <img src="${lang.img}" alt="${lang.text} Flag" class="w-8 h-8 rounded-full shadow-lg">
                </button>
            `).join('')}
        </div>
    `;
}

const navigateAndClose = (target) => {
    document.querySelector(`.sidebar-link[data-target="${target}"]`)?.click();
    closeModal();
};

export function showWelcomeModal() {
    const shouldShow = !hasShownWelcomeModal;
    hasShownWelcomeModal = true;
    // (Lógica de não exibir se já exibiu fica a cargo de quem chama ou persistência externa, se houver)

    const content = `
        <div class="text-center p-4">
            ${renderLanguageSelectors()}
            <img src="./assets/bkc_logo_3d.png" alt="Backcoin.org Logo" class="h-20 w-20 mx-auto mb-4 shadow-xl rounded-full border-4 border-amber-500/50">
            <h2 class="text-4xl font-extrabold text-amber-400 leading-none">${getTranslation('welcome_name')}</h2> 
            <h3 class="text-xl font-semibold text-white mb-4">${getTranslation('welcome_slogan')}</h3>
            <h3 class="text-lg font-semibold text-purple-400 mt-6">${getTranslation('welcome_subtitle_strategic')}</h3>
            <p class="text-zinc-300 mb-8 max-w-sm mx-auto">${getTranslation('welcome_description_strategic')}</p>
            <div class="flex flex-col gap-3">
                <button id="welcomeBtnPresale" class="w-full bg-amber-500 hover:bg-amber-600 text-zinc-900 font-extrabold py-3 px-5 rounded-xl text-lg transition-all duration-300 transform hover:scale-[1.02] shadow-xl">
                    <i class="fa-solid fa-tags mr-3"></i> ${getTranslation('welcome_presale_btn')}
                </button>
                <button id="welcomeBtnTestnet" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold py-3 px-5 rounded-xl text-lg transition-all duration-300 transform hover:scale-[1.02] shadow-xl">
                    <i class="fa-solid fa-flask mr-3"></i> ${getTranslation('welcome_testnet_btn')}
                </button>
                <button id="welcomeBtnAirdrop" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-3 px-5 rounded-xl text-lg transition-all duration-300 transform hover:scale-[1.02] shadow-xl">
                    <i class="fa-solid fa-parachute-box mr-3"></i> ${getTranslation('welcome_airdrop_btn')}
                </button>
            </div>
            <button class="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 font-semibold py-3 px-4 rounded-xl transition-colors closeModalBtn text-base mt-4">
                <i class="fa-solid fa-compass mr-3"></i> ${getTranslation('welcome_explore_btn')}
            </button>
        </div>
    `;
    openModal(content, 'max-w-sm'); 
    const modalContent = document.getElementById('modal-content');
    if (!modalContent) return;

    modalContent.querySelectorAll('.lang-selector').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault(); 
            const newLang = e.currentTarget.dataset.lang;
            setLanguage(newLang); 
        });
    });

    modalContent.querySelector('#welcomeBtnPresale')?.addEventListener('click', () => navigateAndClose('presale'));
    modalContent.querySelector('#welcomeBtnTestnet')?.addEventListener('click', () => navigateAndClose('faucet'));
    modalContent.querySelector('#welcomeBtnAirdrop')?.addEventListener('click', () => navigateAndClose('airdrop'));
}