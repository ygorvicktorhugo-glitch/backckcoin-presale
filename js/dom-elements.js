// js/dom-elements.js
// ✅ VERSÃO CORRIGIDA: Inclui a função 'initDOMElements' exigida pelo app.js

export const DOMElements = {
    // Inicializamos como null para evitar erros de referência antes do DOM carregar
    connectButtonDesktop: null,
    connectButtonMobile: null,
    toastContainer: null,
    modalContainer: null,
    presale: null,
    marketplaceGrid: null, // Crítico para a página de vendas
    
    // Outros elementos de estrutura
    sidebar: null,
    menuBtn: null,
    navLinks: null,
};

export function initDOMElements() {
    // Esta função é chamada pelo app.js quando a página termina de carregar
    DOMElements.connectButtonDesktop = document.getElementById('connectButtonDesktop');
    DOMElements.connectButtonMobile = document.getElementById('connectButtonMobile');
    
    DOMElements.toastContainer = document.getElementById('toast-container');
    DOMElements.modalContainer = document.getElementById('modal-container');
    
    // Área principal da Pré-venda
    DOMElements.presale = document.getElementById('presale');
    DOMElements.marketplaceGrid = document.getElementById('marketplace-grid');

    // Navegação (se existir no index.html)
    DOMElements.sidebar = document.getElementById('sidebar');
    DOMElements.menuBtn = document.getElementById('menu-btn');
    DOMElements.navLinks = document.getElementById('nav-links');

    console.log("✅ DOM Elements Initialized & Mapped");
}