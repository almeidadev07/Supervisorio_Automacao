// initial_wizard.js - Assistente de configuração inicial (reutiliza Parâmetros)

(function () {
  document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('initial-setup-modal');
    if (!modal) return;

    const steps = Array.from(document.querySelectorAll('.wizard-step'));
    const stepperItems = Array.from(document.querySelectorAll('.wizard-stepper-item'));
    const backBtn = document.getElementById('wizard-back');
    const nextBtn = document.getElementById('wizard-next');
    const finishBtn = document.getElementById('wizard-finish');
    const summaryEl = document.getElementById('wizard-summary');
    const statusEl = document.getElementById('wizard-status');
    const settingsShared = document.getElementById('settings-shared');
    const parking = document.getElementById('wizard-settings-parking');
    const typeCards = Array.from(document.querySelectorAll('.wizard-type-card[data-type]'));
    const themeCards = Array.from(document.querySelectorAll('.wizard-theme-card[data-theme]'));
    const settingsSlots = Array.from(document.querySelectorAll('.wizard-settings-slot'));

    const slotMap = settingsSlots.reduce((acc, slot) => {
      const key = slot.getAttribute('data-slot');
      if (key) acc[key] = slot;
      return acc;
    }, {});

    const stepToSection = {
      2: 'machine',
      3: 'embaladoras',
      4: 'visibility',
      5: 'theme'
    };

    const settingsHome = settingsShared ? settingsShared.parentElement : null;
    const settingsHomeNext = settingsShared ? settingsShared.nextElementSibling : null;

    let currentStep = 0;
    let selectedType = null;
    let lastFocused = null;

    const SETTINGS_KEYS_FALLBACK = {
      GRID_VISIBILITY_KEY: 'supervisor_grid_visibility',
      EMBALADORA_QUANTITY_KEY: 'supervisor_embaladora_quantity',
      THEME_KEY: 'supervisor_theme',
      INITIAL_SETUP_KEY: 'supervisor_initial_setup_done'
    };

    function getSettingsApi() {
      return window.supervisorSettings || null;
    }

    function getSettingsKeys() {
      const api = getSettingsApi();
      return (api && api.keys) ? api.keys : SETTINGS_KEYS_FALLBACK;
    }

    function setStatus(message, type) {
      if (!statusEl) return;
      if (!message) {
        statusEl.textContent = '';
        statusEl.className = 'wizard-status';
        return;
      }
      statusEl.textContent = message;
      statusEl.className = `wizard-status show ${type || ''}`.trim();
    }

    function getCurrentThemeSafe() {
      const api = getSettingsApi();
      if (api && typeof api.getCurrentTheme === 'function') {
        return api.getCurrentTheme();
      }
      return document.documentElement.dataset.theme || 'dark';
    }

    function updateThemeCards() {
      const current = getCurrentThemeSafe();
      themeCards.forEach((card) => {
        const isActive = card.getAttribute('data-theme') === current;
        card.classList.toggle('is-active', isActive);
      });
    }

    function updateTypeCards() {
      typeCards.forEach((card) => {
        const type = card.getAttribute('data-type');
        card.classList.toggle('is-selected', type === selectedType);
      });
    }

    function updateSummary() {
      if (!summaryEl) return;

      const machine = document.getElementById('machine-select')?.value || '—';
      const quantity = document.getElementById('embaladora-quantity')?.value || '—';
      const theme = getCurrentThemeSafe();

      const visibleItems = [];
      document.querySelectorAll('.machine-visibility-list .machine-check').forEach((label) => {
        const input = label.querySelector('input[type="checkbox"]');
        if (input && input.checked) {
          const text = label.querySelector('.machine-check-text')?.textContent?.trim();
          if (text) visibleItems.push(text);
        }
      });

      summaryEl.innerHTML = '';

      const rows = [
        { label: 'Máquina', value: machine },
        { label: 'Embaladoras', value: quantity },
        { label: 'Tema', value: theme === 'light' ? 'Light' : 'Dark' },
        { label: 'Visibilidade', value: visibleItems.length ? visibleItems.join(', ') : 'Nenhum item ativo' }
      ];

      rows.forEach((row) => {
        const item = document.createElement('div');
        item.className = 'wizard-summary-item';

        const label = document.createElement('div');
        label.className = 'wizard-summary-label';
        label.textContent = row.label;

        const value = document.createElement('div');
        value.className = 'wizard-summary-value';
        value.textContent = row.value;

        item.appendChild(label);
        item.appendChild(value);
        summaryEl.appendChild(item);
      });
    }

    function isStepValid(step) {
      if (step === 1) {
        return selectedType === 'classificadora';
      }
      if (step === 2 || step === 6) {
        const select = document.getElementById('machine-select');
        return !!(select && select.value);
      }
      if (step === 3) {
        const quantity = document.getElementById('embaladora-quantity');
        return !!(quantity && quantity.value);
      }
      return true;
    }

    function updateNavState() {
      const isLast = currentStep === steps.length - 1;
      if (backBtn) backBtn.disabled = currentStep === 0;
      if (nextBtn) {
        nextBtn.style.display = isLast ? 'none' : 'inline-flex';
        nextBtn.textContent = currentStep === 0 ? 'Iniciar' : 'Próximo';
        nextBtn.disabled = !isStepValid(currentStep);
      }
      if (finishBtn) {
        finishBtn.style.display = isLast ? 'inline-flex' : 'none';
        finishBtn.disabled = !isStepValid(currentStep);
      }
    }

    function moveSharedToSlot(step) {
      if (!settingsShared) return;
      const section = stepToSection[step];
      if (section) {
        const slot = slotMap[section];
        if (slot && settingsShared.parentElement !== slot) {
          slot.appendChild(settingsShared);
        }
        settingsShared.dataset.activeSection = section;
      } else {
        if (parking && settingsShared.parentElement !== parking) {
          parking.appendChild(settingsShared);
        }
        settingsShared.dataset.activeSection = '';
      }
    }

    function setStep(index) {
      currentStep = Math.max(0, Math.min(index, steps.length - 1));
      steps.forEach((step) => {
        const stepIndex = parseInt(step.getAttribute('data-step'), 10);
        step.classList.toggle('is-active', stepIndex === currentStep);
      });
      stepperItems.forEach((item) => {
        const stepIndex = parseInt(item.getAttribute('data-step'), 10);
        item.classList.toggle('is-active', stepIndex === currentStep);
        item.classList.toggle('is-complete', stepIndex < currentStep);
      });
      moveSharedToSlot(currentStep);
      updateSummary();
      updateThemeCards();
      updateNavState();
      setStatus('');
    }

    function focusFirstElement() {
      const focusable = Array.from(modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
        .filter((el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true');
      if (focusable.length) {
        focusable[0].focus();
      }
    }

    function trapFocus(event) {
      if (!modal.classList.contains('show')) return;
      if (event.key !== 'Tab') return;

      const focusable = Array.from(modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
        .filter((el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true');
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function openWizard() {
      if (modal.classList.contains('show')) return;
      lastFocused = document.activeElement;
      modal.classList.remove('hidden');
      modal.classList.add('show');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('wizard-open');
      document.addEventListener('keydown', trapFocus);
      selectedType = null;
      updateTypeCards();
      setStep(0);
      focusFirstElement();
    }

    function closeWizard() {
      modal.classList.add('hidden');
      modal.classList.remove('show');
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('wizard-open');
      document.removeEventListener('keydown', trapFocus);
      if (settingsShared && settingsHome) {
        if (settingsHomeNext && settingsHomeNext.parentElement === settingsHome) {
          settingsHome.insertBefore(settingsShared, settingsHomeNext);
        } else {
          settingsHome.appendChild(settingsShared);
        }
        settingsShared.dataset.activeSection = '';
      }
      if (lastFocused && typeof lastFocused.focus === 'function') {
        lastFocused.focus();
      }
    }

    async function primeSettings() {
      const api = getSettingsApi();
      if (!api) return;
      const keys = getSettingsKeys();
      const setupDone = localStorage.getItem(keys.INITIAL_SETUP_KEY) === '1';
      try {
        api.loadVisibilitySettings();
      } catch (_) {}
      try {
        await api.loadMachines();
        if (setupDone && typeof api.loadCurrentMachine === 'function') {
          await api.loadCurrentMachine();
        }
      } catch (_) {}
      try {
        api.captureInitialSettings();
      } catch (_) {}
      if (!setupDone) {
        const select = document.getElementById('machine-select');
        if (select) {
          select.value = '';
        }
        if (api && typeof api.syncMachineButtons === 'function') {
          api.syncMachineButtons('');
        }
      }
    }

    async function attemptFinish() {
      const api = getSettingsApi();
      if (!api || typeof api.handleConfirmClick !== 'function') {
        closeWizard();
        return;
      }
      setStatus('');
      await api.handleConfirmClick(false, true);

      const keys = getSettingsKeys();
      const done = localStorage.getItem(keys.INITIAL_SETUP_KEY) === '1';
      if (done) {
        setStatus('Configuração inicial concluída com sucesso.', 'success');
        setTimeout(() => {
          closeWizard();
        }, 400);
      } else {
        const modalStatus = document.getElementById('machine-modal-status');
        const message = modalStatus?.textContent?.trim() || 'Não foi possível concluir. Verifique a seleção da máquina e a conexão do PLC.';
        setStatus(message, 'error');
      }
    }

    async function shouldOpenWizard() {
      const keys = getSettingsKeys();
      const done = localStorage.getItem(keys.INITIAL_SETUP_KEY) === '1';
      if (done) return false;

      const hasVisibility = !!localStorage.getItem(keys.GRID_VISIBILITY_KEY);
      const hasQuantity = !!localStorage.getItem(keys.EMBALADORA_QUANTITY_KEY);
      const hasLocalConfig = hasVisibility && hasQuantity;

      let machineOk = false;
      let machineCheckFailed = false;
      try {
        const response = await fetch('/api/current', { cache: 'no-store' });
        const data = await response.json();
        machineOk = !!(data && data.ok);
      } catch (_) {
        machineCheckFailed = true;
      }

      if (hasLocalConfig && (machineOk || machineCheckFailed)) {
        try { localStorage.setItem(keys.INITIAL_SETUP_KEY, '1'); } catch (_) {}
        return false;
      }

      return !hasLocalConfig || !machineOk;
    }

    typeCards.forEach((card) => {
      const type = card.getAttribute('data-type');
      if (type !== 'classificadora') return;
      card.addEventListener('click', () => {
        selectedType = 'classificadora';
        updateTypeCards();
        updateNavState();
      });
    });

    themeCards.forEach((card) => {
      card.addEventListener('click', () => {
        const theme = card.getAttribute('data-theme');
        const toggle = document.getElementById('theme-toggle');
        if (toggle) {
          toggle.checked = theme === 'dark';
          toggle.dispatchEvent(new Event('change', { bubbles: true }));
        }
        updateThemeCards();
      });
    });

    document.addEventListener('themeChanged', () => {
      updateThemeCards();
      updateSummary();
    });

    document.addEventListener('change', (event) => {
      const target = event.target;
      if (!target) return;
      if (target.id === 'machine-select' || target.id === 'embaladora-quantity') {
        updateNavState();
        updateSummary();
      }
      if (target.matches && target.matches('.machine-visibility-list input[type="checkbox"]')) {
        updateSummary();
      }
    });

    if (backBtn) {
      backBtn.addEventListener('click', () => {
        setStep(currentStep - 1);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (!isStepValid(currentStep)) return;
        setStep(currentStep + 1);
      });
    }

    if (finishBtn) {
      finishBtn.addEventListener('click', async () => {
        if (!isStepValid(currentStep)) return;
        await attemptFinish();
      });
    }

    window.showInitialSetupWizard = async function () {
      await primeSettings();
      openWizard();
    };

    primeSettings().then(() => {
      shouldOpenWizard().then((shouldOpen) => {
        if (shouldOpen) {
          openWizard();
        }
      });
    });
  });
})();
