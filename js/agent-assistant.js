(function () {
  const LOCAL_API_BASE = 'http://118.190.203.52:8081/api';
  const PROD_API_BASE = 'http://118.190.203.52:8081/api';
  const API_BASE = (window.WXGGO_AGENT_API_BASE ||
    window.WXGGO_AGENT_PROD_API_BASE ||
    ((location.hostname === 'localhost' || location.hostname === '127.0.0.1') ? LOCAL_API_BASE : PROD_API_BASE)
  ).replace(/\/$/, '');
  const MEMORY_KEY = 'wxggo-agent-memory-id';
  const POSITION_KEY = 'wxggo-agent-position';
  const EXPANDED_KEY = 'wxggo-agent-expanded';
  const MODEL_KEY = 'wxggo-agent-model-key';

  const DEFAULT_MODELS = [
    { key: 'qwen-plus', displayName: 'Plus', modelName: 'qwen-plus', defaultModel: true },
    { key: 'qwen-max', displayName: 'Max', modelName: 'qwen-max', defaultModel: false },
    { key: 'qwen-turbo', displayName: 'Turbo', modelName: 'qwen-turbo', defaultModel: false },
    { key: 'qwen-long', displayName: 'Long', modelName: 'qwen-long', defaultModel: false }
  ];

  const TEXT = {
    launcherLabel: '打开 wxggo 数字人面试助手',
    dialogLabel: 'wxggo 数字人面试助手',
    title: 'wxggo 数字人',
    subtitle: '基于博客素材库回答面试问题',
    modelLabel: '模型',
    expand: '放大窗口',
    restore: '还原窗口',
    close: '关闭',
    placeholder: '面试官可以直接提问...',
    send: '发送',
    thinking: '思考中',
    intro: '你好，我是 wxggo 的博客数字人。你可以像面试官一样问我项目经历、技术栈、学习路线、八股理解，或博客文章里的内容。',
    noSse: '当前浏览器不支持 SSE 流式对话，请换用现代浏览器访问。',
    notConfigured: '生产环境后端 API 还没有配置。部署 Spring Boot 服务后，把 /js/agent-assistant.js 里的 PROD_API_BASE 改成你的 HTTPS API 地址，或在页面中设置 window.WXGGO_AGENT_API_BASE。',
    networkError: '暂时连接不到后端服务。请确认 Spring Boot 已启动，或生产环境 API 域名、HTTPS 证书、Nginx SSE 代理已配置。',
    suggestions: [
      '介绍一下你的项目经历',
      '你如何理解 RAG 和 Agent？',
      '说说你的求职准备'
    ]
  };

  const ICONS = {
    expand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>',
    restore: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M16 3v3a2 2 0 0 0 2 2h3"/><path d="M8 21v-3a2 2 0 0 0-2-2H3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>'
  };

  function getMemoryId() {
    const saved = localStorage.getItem(MEMORY_KEY);
    if (saved) return saved;
    const next = String(Math.floor(Math.random() * 900000) + 100000);
    localStorage.setItem(MEMORY_KEY, next);
    return next;
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderInlineMarkdown(text) {
    let html = escapeHtml(text);
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\[([^\]]+)]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    html = html.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return html;
  }

  function renderMarkdown(text) {
    const lines = text.split(/\r?\n/);
    const html = [];
    let listOpen = false;

    function closeList() {
      if (listOpen) {
        html.push('</ul>');
        listOpen = false;
      }
    }

    lines.forEach(function (line) {
      const trimmed = line.trim();
      if (!trimmed) {
        closeList();
        html.push('<br>');
        return;
      }

      const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (heading) {
        closeList();
        const level = Math.min(heading[1].length + 2, 6);
        html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
        return;
      }

      const listItem = trimmed.match(/^[-*]\s+(.+)$/);
      if (listItem) {
        if (!listOpen) {
          html.push('<ul>');
          listOpen = true;
        }
        html.push(`<li>${renderInlineMarkdown(listItem[1])}</li>`);
        return;
      }

      closeList();
      html.push(`<p>${renderInlineMarkdown(trimmed)}</p>`);
    });

    closeList();
    return html.join('');
  }

  function initAgentAssistant() {
    if (document.getElementById('wxggo-agent-assistant')) return;

    const root = createElement('section', 'wxggo-agent', '');
    root.id = 'wxggo-agent-assistant';

    const launcher = createElement('button', 'wxggo-agent__launcher', '');
    launcher.type = 'button';
    launcher.setAttribute('aria-label', TEXT.launcherLabel);
    launcher.innerHTML = '<span class="wxggo-agent__launcher-dot"></span><span class="wxggo-agent__launcher-text">AI</span>';

    const panel = createElement('div', 'wxggo-agent__panel', '');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', TEXT.dialogLabel);
    panel.setAttribute('aria-hidden', 'true');

    const header = createElement('header', 'wxggo-agent__header', '');
    const headerCopy = createElement('div', 'wxggo-agent__title', '');
    const title = createElement('strong', '', TEXT.title);
    const subtitle = createElement('span', '', TEXT.subtitle);
    const headerActions = createElement('div', 'wxggo-agent__actions', '');
    const expandButton = createElement('button', 'wxggo-agent__icon-button wxggo-agent__expand', '');
    expandButton.type = 'button';
    expandButton.setAttribute('aria-label', TEXT.expand);
    expandButton.title = TEXT.expand;
    expandButton.innerHTML = ICONS.expand;
    const closeButton = createElement('button', 'wxggo-agent__icon-button wxggo-agent__close', '');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', TEXT.close);
    closeButton.title = TEXT.close;
    closeButton.innerHTML = ICONS.close;
    headerCopy.append(title, subtitle);
    headerActions.append(expandButton, closeButton);
    header.append(headerCopy, headerActions);

    const modelBar = createElement('div', 'wxggo-agent__modelbar', '');
    const modelLabel = createElement('span', 'wxggo-agent__model-label', TEXT.modelLabel);
    const modelOptions = createElement('div', 'wxggo-agent__model-options', '');
    modelBar.append(modelLabel, modelOptions);

    const messages = createElement('div', 'wxggo-agent__messages', '');
    messages.setAttribute('aria-live', 'polite');

    const suggestions = createElement('div', 'wxggo-agent__suggestions', '');
    TEXT.suggestions.forEach(function (suggestion) {
      const button = createElement('button', '', suggestion);
      button.type = 'button';
      suggestions.appendChild(button);
    });

    const form = createElement('form', 'wxggo-agent__form', '');
    const input = createElement('textarea', '', '');
    input.rows = 2;
    input.placeholder = TEXT.placeholder;
    input.setAttribute('aria-label', '输入问题');
    const submitButton = createElement('button', '', TEXT.send);
    submitButton.type = 'submit';
    form.append(input, submitButton);

    panel.append(header, modelBar, messages, suggestions, form);
    root.append(launcher, panel);
    document.body.appendChild(root);

    let currentSource = null;
    let isSending = false;
    let suppressLauncherClick = false;
    let currentModelKey = localStorage.getItem(MODEL_KEY) || DEFAULT_MODELS.find(model => model.defaultModel).key;

    function restorePosition() {
      try {
        const saved = JSON.parse(localStorage.getItem(POSITION_KEY) || 'null');
        if (!saved || typeof saved.left !== 'number' || typeof saved.top !== 'number') return;
        setRootPosition(saved.left, saved.top, false);
      } catch (error) {
        localStorage.removeItem(POSITION_KEY);
      }
    }

    function setRootPosition(left, top, persist) {
      const rect = root.getBoundingClientRect();
      const maxLeft = Math.max(12, window.innerWidth - rect.width - 12);
      const maxTop = Math.max(12, window.innerHeight - rect.height - 12);
      const nextLeft = Math.min(Math.max(12, left), maxLeft);
      const nextTop = Math.min(Math.max(12, top), maxTop);
      root.style.left = `${nextLeft}px`;
      root.style.top = `${nextTop}px`;
      root.style.right = 'auto';
      root.style.bottom = 'auto';
      if (persist) {
        localStorage.setItem(POSITION_KEY, JSON.stringify({ left: nextLeft, top: nextTop }));
      }
    }

    function setExpanded(expanded) {
      root.classList.toggle('wxggo-agent--expanded', expanded);
      expandButton.innerHTML = expanded ? ICONS.restore : ICONS.expand;
      expandButton.setAttribute('aria-label', expanded ? TEXT.restore : TEXT.expand);
      expandButton.title = expanded ? TEXT.restore : TEXT.expand;
      localStorage.setItem(EXPANDED_KEY, String(expanded));
    }

    function setOpen(open) {
      root.classList.toggle('wxggo-agent--open', open);
      panel.setAttribute('aria-hidden', String(!open));
      if (open) input.focus();
    }

    function addMessage(role, text) {
      const message = createElement('div', `wxggo-agent__message wxggo-agent__message--${role}`, '');
      message.dataset.raw = text || '';
      updateMessage(message);
      messages.appendChild(message);
      messages.scrollTop = messages.scrollHeight;
      return message;
    }

    function updateMessage(message) {
      const rawText = message.dataset.raw || '';
      message.innerHTML = renderMarkdown(rawText);
    }

    function appendMessage(message, text) {
      message.dataset.raw = (message.dataset.raw || '') + text;
      updateMessage(message);
    }

    function setBusy(busy) {
      isSending = busy;
      input.disabled = busy;
      submitButton.disabled = busy;
      submitButton.textContent = busy ? TEXT.thinking : TEXT.send;
    }

    function closeCurrentSource() {
      if (currentSource) {
        currentSource.close();
        currentSource = null;
      }
    }

    function renderModelOptions(models) {
      const options = models && models.length ? models : DEFAULT_MODELS;
      if (!options.some(model => model.key === currentModelKey)) {
        const defaultModel = options.find(model => model.defaultModel) || options[0];
        currentModelKey = defaultModel.key;
        localStorage.setItem(MODEL_KEY, currentModelKey);
      }

      modelOptions.innerHTML = '';
      options.forEach(function (model) {
        const button = createElement('button', '', model.displayName || model.modelName || model.key);
        button.type = 'button';
        button.dataset.modelKey = model.key;
        button.title = model.modelName || model.key;
        button.classList.toggle('is-active', model.key === currentModelKey);
        button.addEventListener('click', function () {
          if (isSending || currentModelKey === model.key) return;
          currentModelKey = model.key;
          localStorage.setItem(MODEL_KEY, currentModelKey);
          renderModelOptions(options);
        });
        modelOptions.appendChild(button);
      });
    }

    function loadModelOptions() {
      renderModelOptions(DEFAULT_MODELS);
      fetch(`${API_BASE}/ai/models`)
        .then(function (response) {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json();
        })
        .then(function (data) {
          renderModelOptions(data.models || DEFAULT_MODELS);
        })
        .catch(function () {
          renderModelOptions(DEFAULT_MODELS);
        });
    }

    function sendMessage(text) {
      const question = text.trim();
      if (!question || isSending) return;
      if (!window.EventSource) {
        addMessage('assistant', TEXT.noSse);
        return;
      }
      if (API_BASE.indexOf('your-domain.example') !== -1) {
        addMessage('assistant', TEXT.notConfigured);
        return;
      }

      closeCurrentSource();
      addMessage('user', question);
      input.value = '';
      setBusy(true);
      const assistantMessage = addMessage('assistant', '');
      assistantMessage.classList.add('is-waiting');

      const chatUrl = new URL(`${API_BASE}/ai/chat`);
      chatUrl.searchParams.set('memoryId', getMemoryId());
      chatUrl.searchParams.set('message', question);
      chatUrl.searchParams.set('modelKey', currentModelKey);

      let received = false;
      currentSource = new EventSource(chatUrl.toString());
      currentSource.onmessage = function (event) {
        received = true;
        assistantMessage.classList.remove('is-waiting');
        appendMessage(assistantMessage, event.data);
        messages.scrollTop = messages.scrollHeight;
      };
      currentSource.onerror = function () {
        closeCurrentSource();
        assistantMessage.classList.remove('is-waiting');
        if (!received) {
          assistantMessage.dataset.raw = TEXT.networkError;
          updateMessage(assistantMessage);
        }
        setBusy(false);
      };
    }

    function bindDrag(handle) {
      handle.addEventListener('pointerdown', function (event) {
        if (event.button !== 0 || root.classList.contains('wxggo-agent--expanded')) return;
        if (event.target.closest('button, textarea, a')) return;

        const startX = event.clientX;
        const startY = event.clientY;
        const rect = root.getBoundingClientRect();
        let moved = false;
        handle.setPointerCapture(event.pointerId);
        root.classList.add('wxggo-agent--dragging');

        function onPointerMove(moveEvent) {
          const deltaX = moveEvent.clientX - startX;
          const deltaY = moveEvent.clientY - startY;
          if (Math.abs(deltaX) + Math.abs(deltaY) > 5) moved = true;
          setRootPosition(rect.left + deltaX, rect.top + deltaY, false);
        }

        function onPointerUp(upEvent) {
          handle.releasePointerCapture(upEvent.pointerId);
          handle.removeEventListener('pointermove', onPointerMove);
          handle.removeEventListener('pointerup', onPointerUp);
          handle.removeEventListener('pointercancel', onPointerUp);
          root.classList.remove('wxggo-agent--dragging');
          if (moved) {
            const nextRect = root.getBoundingClientRect();
            setRootPosition(nextRect.left, nextRect.top, true);
            suppressLauncherClick = handle === launcher;
          }
        }

        handle.addEventListener('pointermove', onPointerMove);
        handle.addEventListener('pointerup', onPointerUp);
        handle.addEventListener('pointercancel', onPointerUp);
      });
    }

    launcher.addEventListener('click', function () {
      if (suppressLauncherClick) {
        suppressLauncherClick = false;
        return;
      }
      setOpen(!root.classList.contains('wxggo-agent--open'));
    });
    expandButton.addEventListener('click', function () {
      setExpanded(!root.classList.contains('wxggo-agent--expanded'));
    });
    closeButton.addEventListener('click', function () {
      setOpen(false);
      closeCurrentSource();
      setBusy(false);
    });
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      sendMessage(input.value);
    });
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        form.requestSubmit();
      }
    });
    suggestions.querySelectorAll('button').forEach(function (button) {
      button.addEventListener('click', function () {
        sendMessage(button.textContent);
      });
    });
    window.addEventListener('resize', function () {
      const rect = root.getBoundingClientRect();
      if (root.style.left && root.style.top) {
        setRootPosition(rect.left, rect.top, true);
      }
    });

    restorePosition();
    bindDrag(launcher);
    bindDrag(header);
    loadModelOptions();
    setExpanded(localStorage.getItem(EXPANDED_KEY) === 'true');
    addMessage('assistant', TEXT.intro);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAgentAssistant);
  } else {
    initAgentAssistant();
  }
})();
