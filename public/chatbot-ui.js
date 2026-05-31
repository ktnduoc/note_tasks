(function () {
  const wrapper = document.getElementById('bot-widget-wrapper');
  if (!wrapper) return;

  // Sẽ load từ server
  let apiBase = 'https://api.cerebras.ai/v1';
  let apiKeys = [];
  let model = 'gpt-oss-120b';
  let cooldownMs = 30000;
  let configLoaded = false;

  // Model switching: đã test - chỉ giữ model hoạt động
  let currentModelType = 'gemma31b'; // Mặc định Gemma (free, ổn định)
  let kimiApiKey = ''; // Sẽ load từ server (OpenRouter key)
  const modelConfigs = {
    oss: {
      name: 'OSS 120B (Cerebras)',
      apiBase: 'https://api.cerebras.ai/v1',
      model: 'gpt-oss-120b',
      getKeys: () => apiKeys,
    },
    kimi: {
      name: 'Kimi K2.6 (Paid)',
      apiBase: 'https://openrouter.ai/api/v1',
      model: 'moonshotai/kimi-k2.6',
      getKeys: () => kimiApiKey ? [kimiApiKey] : [],
    },
    gptoss: {
      name: 'GPT-OSS 120B (Free)',
      apiBase: 'https://openrouter.ai/api/v1',
      model: 'openai/gpt-oss-120b:free',
      getKeys: () => kimiApiKey ? [kimiApiKey] : [],
    },
    gemma31b: {
      name: 'Gemma 4 31B (Free)',
      apiBase: 'https://openrouter.ai/api/v1',
      model: 'google/gemma-4-31b-it:free',
      getKeys: () => kimiApiKey ? [kimiApiKey] : [],
    },
    nemotron: {
      name: 'Nemotron 3 Super (Free)',
      apiBase: 'https://openrouter.ai/api/v1',
      model: 'nvidia/nemotron-3-super-120b-a12b:free',
      getKeys: () => kimiApiKey ? [kimiApiKey] : [],
    },
  };

  // Fetch keys từ server .env (bảo mật, không lộ key)
  async function loadConfig() {
    try {
      const res = await fetch('/api/chatbot/config');
      const json = await res.json();
      if (json.success && json.data) {
        apiKeys = json.data.keys || [];
        model = json.data.model || 'gpt-oss-120b';
        apiBase = json.data.apiBase || 'https://api.cerebras.ai/v1';
        cooldownMs = json.data.cooldown || 30000;

        // Load Kimi key
        if (json.data.kimiKey) {
          kimiApiKey = json.data.kimiKey;
        }
      }
    } catch (e) {
      console.error('Không load được config từ server:', e);
    }
    configLoaded = true;
  }

  // Đảm bảo config loaded trước khi gọi API
  async function ensureConfig() {
    if (!configLoaded) await loadConfig();
  }

  // Quản lý key: index hiện tại + map thời gian cooldown
  let currentKeyIndex = 0;
  const keyCooldowns = {}; // { index: timestamp until cooldown }

  function getNextAvailableKey() {
    const now = Date.now();
    const startIdx = currentKeyIndex;
    for (let i = 0; i < apiKeys.length; i++) {
      const idx = (startIdx + i) % apiKeys.length;
      if (!keyCooldowns[idx] || keyCooldowns[idx] <= now) {
        currentKeyIndex = (idx + 1) % apiKeys.length;
        return { key: apiKeys[idx], index: idx };
      }
    }
    // Tất cả key đều bị rate limit
    const minTime = Math.min(...Object.values(keyCooldowns));
    const waitSec = Math.ceil((minTime - now) / 1000);
    throw new Error(`Tất cả API key đều bị rate limit. Thử lại sau ${waitSec}s.`);
  }

  function markKeyRateLimited(index) {
    keyCooldowns[index] = Date.now() + cooldownMs;
  }

  const fab = document.getElementById('bot-widget-fab');
  const input = document.getElementById('bot-input-field');
  const sendBtn = document.getElementById('bot-send-btn');
  const sendBtnOriginalHTML = sendBtn ? sendBtn.innerHTML : '';
  let abortController = null; // Để dừng request đang chạy
  const messages = document.getElementById('bot-messages-container');
  const resizeHandle = document.getElementById('bot-input-resizer');
  const newChatBtn = document.getElementById('bot-new-chat');
  const uploadBtn = document.getElementById('bot-file-upload-btn');
  const toastStack = document.getElementById('bot-toast-stack');
  const confirmModal = document.getElementById('bot-confirm-modal');
  const confirmYes = document.getElementById('bot-confirm-yes');
  const confirmNo = document.getElementById('bot-confirm-no');
  const statusDot = wrapper.querySelector('.status-dot');
  const statusText = document.getElementById('bot-header-status');
  const bubble = document.getElementById('bot-message-bubble');

  const welcome = 'Xin chào! Tôi là trợ lý NoteTasks. Tôi giúp bạn **tạo task, quản lý danh mục, xem công việc theo ngày**. Hãy thử click nút bên dưới hoặc gõ câu hỏi nhé!';

  const chatbotThemes = {
    blue: {
      primary: '#6c8ebf',
      secondary: '#3d5a80',
      persona: 'Bình thường',
      instruction: [
        'Phong cách: lịch sự, hữu ích và đáng tin cậy.',
        'Giọng văn: thân thiện vừa phải, điềm đạm, rõ ràng.',
        'Ưu tiên trả lời chính xác, dễ hiểu, không dùng quá nhiều emoji.',
      ].join(' '),
    },
    green: {
      primary: '#6db580',
      secondary: '#2f7d55',
      persona: 'Chuyên nghiệp',
      instruction: [
        'Phong cách: chuyên nghiệp, súc tích và đi thẳng vào vấn đề.',
        'Giọng văn: khách quan, chuẩn mực, có tính công việc.',
        'Ưu tiên gạch đầu dòng, quy trình từng bước, không dùng emoji nếu không cần.',
      ].join(' '),
    },
    red: {
      primary: '#c97b84',
      secondary: '#8f3f49',
      persona: 'Khó tính',
      instruction: [
        'Phong cách: nghiêm túc, thẳng thắn và cẩn thận.',
        'Nếu người dùng thiếu thông tin, hỏi lại ngay và nêu rõ rủi ro.',
        'Không đùa cợt, không vòng vo, ưu tiên kiểm tra dữ liệu trước khi hành động.',
      ].join(' '),
    },
    orange: {
      primary: '#d4956a',
      secondary: '#9a6138',
      persona: 'GenZ',
      instruction: [
        'Bạn là trợ lý GenZ trung tính, năng động, hài hước, phóng khoáng. Nam hay nữ nghe đều thấy hợp.',
        'Tông giọng: tích cực, có gu, hài nhẹ. Xưng hô linh hoạt: "mình-bạn", "tớ-cậu", "ông bạn", "chủ thớt". KHÔNG sến (bạn iu, bấy bì), KHÔNG trang trọng (kính thưa).',
        'Slang: flex, cuốn, ổn áp, chất, vibe, xu cà na, gét gô, bất lực, khét, ét ô ét. Viết tắt nhẹ: j, ko, bth, mng, đc...',
        'Emoji vừa phải: 😎😂🚀🔥🤔👑. Icon tấu hài: :v, XD, 🐧.',
        'Giới hạn: kiến thức/công việc phải chính xác, uy tín. User buồn thì hạ tông, chân thành ấm áp.',
      ].join(' '),
    },
  };

  let currentThemeKey = 'blue';
  let chatHistory = [];
  let pendingAction = null;
  let deletedTaskSnapshots = [];
  const maxHistoryMessages = 12;
  let suppressNextFabClick = false;
  let bounceAnimId = null;
  let botAuthToken = null;
  let botCurrentUser = null;
  let messageCount = 0;
  const maxMessages = 20;

  // Load theme từ localStorage
  const savedTheme = localStorage.getItem('chatbot-theme');
  if (savedTheme && chatbotThemes[savedTheme]) {
    currentThemeKey = savedTheme;
  }

  // Nút gợi ý nhanh
  const quickSuggestions = [
    { label: '📝 Tạo task mới', action: 'tạo task' },
    { label: '📊 Thống kê hôm nay', action: 'thống kê task hôm nay' },
  ];

  const svgIcons = {
    plus: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    folder: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>',
    calendar: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    lightbulb: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0018 8 6 6 0 006 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 018.91 14"/></svg>',
    alert: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
    xcircle: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    wrench: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>',
  };

  let isSending = false;

  function pushHistory(role, content) {
    const text = String(content || '').trim();
    if (!text) return;
    chatHistory.push({ role, content: text });
    if (chatHistory.length > maxHistoryMessages) {
      chatHistory = chatHistory.slice(-maxHistoryMessages);
    }
  }

  function getSystemPrompt() {
    const authStatus = botCurrentUser
      ? `Người dùng đã đăng nhập: ${botCurrentUser.username} (role: ${botCurrentUser.role}).`
      : 'Người dùng CHƯA đăng nhập. Vẫn CÓ THỂ xem/tìm kiếm/tra cứu/thống kê task và danh mục bình thường. Chỉ KHÔNG thể tạo/sửa/xóa.';

    const authInstruction = botCurrentUser && botCurrentUser.role === 'viewer'
      ? 'User có role VIEWER - chỉ được XEM, KHÔNG được tạo/sửa/xóa. Từ chối lịch sự nếu user yêu cầu thao tác ghi.'
      : botCurrentUser
      ? 'User có quyền đầy đủ để tạo/sửa/xóa task và danh mục.'
      : 'User chưa đăng nhập. Khi user yêu cầu tạo/sửa/xóa: từ chối và hướng dẫn gõ /login. Khi user hỏi/tìm kiếm/xem/thống kê: VẪN XỬ LÝ BÌNH THƯỜNG, gọi query_db hoặc list_tasks hoặc get_task_stats. Nếu không rõ user muốn tạo hay tìm, MẶC ĐỊNH là TÌM KIẾM.';

    return [
      'Bạn là trợ lý AI cho ứng dụng NoteTasks - app quản lý công việc theo danh mục ngày & lý do.',
      authStatus,
      authInstruction,
      'Luôn trả lời bằng tiếng Việt.',
      'TUYỆT ĐỐI không dùng từ chỉ giới tính: không "cô", "anh", "chú", "chị", "bác", "em"... Chỉ dùng "bạn" để xưng hô.',
      'DÙNG ĐỊNH DẠNG trong câu trả lời: **in đậm** cho từ khóa, *in nghiêng* cho nhấn mạnh, !!red:chữ màu!! để tô màu (dùng red, green, blue, orange, #hex).',
      'Ví dụ: "!!green:Đã xong!! 3 task, !!red:còn 2 task!! chưa xong."',
      'KHI GỌI TOOL/ACTION: Trả lời ngắn gọn TRƯỚC KHI gọi tool. Ví dụ: "Ok tôi sẽ tìm kiếm giúp bạn ngay" rồi mới gọi list_tasks.',
      'SAU KHI tool trả kết quả: Hệ thống sẽ tự động hiển thị kết quả, bạn KHÔNG cần tóm tắt lại.',
      'Câu trả lời ban đầu nên ngắn, thân thiện, cho user biết bạn đang xử lý.',
      getThemeInstruction(),
      'Khi người dùng muốn tạo một task kèm một danh mục mới trong cùng câu lệnh: GỌI create_task_with_category, không tách thành 2 bước.',
      'Khi người dùng muốn tạo nhiều task trong cùng một câu: GỌI create_many_tasks một lần. Nếu thiếu lý do chung hoặc lý do riêng, hỏi thêm trước khi tạo.',
      'Khi tạo task: GỌI create_task. Tên danh mục không cần chính xác 100%, hệ thống sẽ tự tìm gần đúng.',
      'Khi cần danh mục: GỌI create_category / update_category / delete_category.',
      'Khi xem task: GỌI list_tasks.',
      'Khi người dùng nói "đánh dấu xong 5 task đầu" thì GỌI update_tasks_status với completed=true, count=5, startIndex=1. Không hỏi lại tên task.',
      'Khi người dùng muốn đánh dấu xong/chưa xong task, đặc biệt như "5 task đầu", "3 task đầu tiên", "tất cả task": GỌI update_tasks_status.',
              'Khi người dùng nói "xoá tất cả các task hôm nay" thì GỌI delete_tasks với all=true và date là ngày hôm nay. Không đề xuất xoá danh mục.',
      'Khi người dùng muốn sửa tên/lý do 1 task: BẢO họ dùng lệnh "/edit #mã-task Tên mới | Lý do mới". KHÔNG nói "API không hỗ trợ sửa task".',
      'Khi người dùng muốn cập nhật TIẾN ĐỘ 1 task: GỌI update_task_progress với taskId (nếu đã biết từ kết quả trước) hoặc taskName. Nếu không rõ task nào, hỏi lại tên hoặc mã task.',
      'Khi người dùng muốn xoá 1 task cụ thể: BẢO họ dùng lệnh "/del #mã-task".',
      'Khi người dùng muốn xoá task, xoá tất cả task hôm nay, xoá N task đầu, hoặc xoá task theo tên/danh mục: GỌI delete_tasks. Không nói rằng hệ thống chỉ xoá được danh mục.',
      'Khi người dùng muốn phục hồi/khôi phục task vừa xoá: GỌI restore_deleted_tasks. Khi muốn phục hồi task đã xoá từ trước (không phải phiên hiện tại): GỌI restore_deleted_task với tên hoặc ID task. Nếu không rõ tên, GỌI query_db với includeDeleted=true để xem danh sách task đã xoá trước.',
      'Khi hỏi thống kê/tổng số/bao nhiêu task/đã xong/chưa xong/theo ưu tiên/theo danh mục: GỌI get_task_stats. Tool này trả về CẢ thống kê VÀ danh sách chi tiết từng task.',
      'Nếu thiếu thông tin, hỏi lại. Nếu không tìm thấy danh mục, gợi ý danh sách có sẵn.',
      'API tạo task có các trường: name (tên, bắt buộc), reason (lý do, optional), description (mô tả chi tiết, optional), categoryName, date, priority.',
      'Lý do (reason) và mô tả chi tiết (description) đều KHÔNG bắt buộc. Nếu user không nói thì có thể bỏ qua.',
      'Khi người dùng muốn tạo nhiều task trong cùng một câu: GỌI create_many_tasks một lần, không gọi create_task lặp lại.',
      'Khi cập nhật nhiều task theo thứ tự, hiểu "task đầu" là các task đầu trong danh sách hiện tại sau khi lọc theo ngày/danh mục nếu có.',
      'Khi xoá nhiều task theo thứ tự, hiểu "task đầu" là các task đầu trong danh sách hiện tại sau khi lọc theo ngày/danh mục nếu có.',
      'Luôn giữ ngữ cảnh hội thoại trước đó. Nếu người dùng đang bổ sung thông tin cho tác vụ đang hỏi dở, tiếp tục tác vụ đó thay vì huỷ hoặc bắt đầu lại.',
      'KHI NGƯỜI DÙNG DÙNG TỪ THAY THẾ ("nó", "task đó", "cái này", "đấy"): tự động hiểu là task/category VỪA được nhắc đến trong tin nhắn trước của bot. Dùng taskId đã có sẵn từ kết quả query_db/list_tasks trước đó.',
    ].join(' ');
  }

  function setOpen(isOpen) {
    wrapper.classList.toggle('is-open', isOpen);
    fab?.classList.toggle('popup-open', isOpen);
    if (isOpen) setTimeout(() => input?.focus(), 80);
  }

  function scrollBottom() {
    if (messages) messages.scrollTop = messages.scrollHeight;
  }

  function escapeHtml(value) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatInlineMarkdown(value) {
    // Xử lý nút chi tiết task trước khi escape: [detail:taskId:label]
    const detailBtns = [];
    value = value.replace(/\[detail:([a-f0-9]+):(.+?)\]/gi, (_, id, label) => {
      detailBtns.push({ id, label });
      return `\u0000DTL${detailBtns.length - 1}\u0000`;
    });

    let html = escapeHtml(value)
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
      .replace(/\b_([^_]+)_\b/g, '<em>$1</em>')
      // Màu sắc: !!red:text!! hoặc !!#ff0000:text!!
      .replace(/!!([a-z]+|#[0-9a-f]{3,6}):(.+?)!!/gi, '<span style="color:$1">$2</span>');

    // Khôi phục nút chi tiết
    html = html.replace(/\u0000DTL(\d+)\u0000/g, (_, idx) => {
      const d = detailBtns[parseInt(idx)];
      if (!d) return '';
      return `<button class="bot-detail-btn" onclick="event.stopPropagation();viewTaskDetail('${d.id}')" title="Xem chi tiết">${escapeHtml(d.label)}</button>`;
    });

    return html;
  }

  function renderBotMarkdown(text) {
    const lines = text.split(/\r?\n/);
    const html = [];
    let listType = null;
    let inTable = false;
    let tableRows = [];
    let inCodeBlock = false;
    let codeContent = [];
    let inBlockquote = false;
    let blockquoteLines = [];

    function closeList() {
      if (!listType) return;
      html.push(`</${listType}>`);
      listType = null;
    }
    function flushTable() {
      if (!tableRows.length) return;
      html.push('<table class="bot-table">');
      tableRows.forEach((row, i) => {
        const tag = i === 0 ? 'thead' : 'tbody';
        if (i === 0) html.push(`<${tag}><tr>`);
        else if (i === 1) { html.push(`</thead><tbody><tr>`); }
        else html.push('<tr>');
        row.forEach(cell => {
          const cellTag = i === 0 ? 'th' : 'td';
          html.push(`<${cellTag}>${formatInlineMarkdown(cell.trim())}</${cellTag}>`);
        });
        html.push('</tr>');
        if (i === 0) html.push(`</${tag}>`);
      });
      html.push('</tbody></table>');
      tableRows = [];
      inTable = false;
    }
    function flushCodeBlock() {
      if (!codeContent.length) return;
      html.push(`<pre><code>${escapeHtml(codeContent.join('\n'))}</code></pre>`);
      codeContent = [];
      inCodeBlock = false;
    }
    function flushBlockquote() {
      if (!blockquoteLines.length) return;
      html.push(`<blockquote>${formatInlineMarkdown(blockquoteLines.join('<br>'))}</blockquote>`);
      blockquoteLines = [];
      inBlockquote = false;
    }

    for (const rawLine of lines) {
      const line = rawLine.trim();

      // Code block
      if (line.startsWith('```')) {
        if (inCodeBlock) { flushCodeBlock(); continue; }
        closeList(); flushTable(); flushBlockquote();
        inCodeBlock = true;
        codeContent = [];
        continue;
      }
      if (inCodeBlock) { codeContent.push(rawLine); continue; }

      // Table
      if (line.startsWith('|') && line.endsWith('|')) {
        closeList(); flushBlockquote();
        const cells = line.split('|').filter(c => c.trim() !== '');
        if (cells.every(c => /^[-:\s]+$/.test(c.trim()))) continue; // separator row
        tableRows.push(cells);
        inTable = true;
        continue;
      }
      if (inTable) { flushTable(); }

      // Blockquote
      if (line.startsWith('>')) {
        closeList(); flushTable();
        const quoteContent = line.replace(/^>\s*/, '');
        blockquoteLines.push(quoteContent);
        inBlockquote = true;
        continue;
      }
      if (inBlockquote) { flushBlockquote(); }

      if (!line) { closeList(); flushTable(); flushBlockquote(); continue; }
      if (/^---+$/.test(line)) { closeList(); flushTable(); flushBlockquote(); html.push('<hr>'); continue; }

      const heading = line.match(/^(#{1,4})\s+(.+)$/);
      if (heading) { closeList(); flushTable(); flushBlockquote(); html.push(`<h3>${formatInlineMarkdown(heading[2])}</h3>`); continue; }

      const bullet = line.match(/^[-*]\s+(.+)$/);
      if (bullet) {
        if (listType !== 'ul') { closeList(); listType = 'ul'; html.push('<ul>'); }
        html.push(`<li>${formatInlineMarkdown(bullet[1])}</li>`);
        continue;
      }

      const numbered = line.match(/^\d+[.)]\s+(.+)$/);
      if (numbered) {
        if (listType !== 'ol') { closeList(); listType = 'ol'; html.push('<ol>'); }
        html.push(`<li>${formatInlineMarkdown(numbered[1])}</li>`);
        continue;
      }

      closeList(); flushTable(); flushBlockquote();
      html.push(`<p>${formatInlineMarkdown(line)}</p>`);
    }
    closeList(); flushTable(); flushCodeBlock(); flushBlockquote();
    return html.join('');
  }

  function setBotMessageContent(targetBubble, text) {
    targetBubble.innerHTML = renderBotMarkdown(text);

    // Thêm badge model bên ngoài bubble
    const container = targetBubble.closest('.message-container');
    if (container) {
      // Xóa badge cũ nếu có
      const oldBadge = container.querySelector('.bot-model-badge');
      if (oldBadge) oldBadge.remove();

      // Thêm badge mới
      const config = modelConfigs[currentModelType];
      const badge = document.createElement('div');
      badge.className = 'bot-model-badge';
      badge.style.cssText = 'margin-top:4px;padding:2px 8px;background:rgba(0,0,0,0.05);border-radius:4px;font-size:9px;opacity:0.5;width:fit-content;';
      badge.textContent = config.name;
      container.appendChild(badge);
    }

    scrollBottom();
  }

  // ===== Fake streaming effect - chỉ hiển thị phần mới thêm vào =====
  async function fakeStreamText(targetBubble, fullText) {
    // Lấy nội dung hiện tại
    const currentText = targetBubble.textContent || '';

    // Nếu fullText bắt đầu bằng currentText, chỉ hiển thị phần mới
    let newPart = fullText;
    if (fullText.startsWith(currentText)) {
      newPart = fullText.substring(currentText.length);
    }

    // Tách phần mới thành các câu
    const sentences = newPart.split(/([.!?]\n)/);

    let displayed = currentText;
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      if (!sentence) continue;

      displayed += sentence;
      targetBubble.innerHTML = renderBotMarkdown(displayed);
      scrollBottom();

      // Delay sau mỗi câu
      if (sentence.match(/[.!?]\n/)) {
        await new Promise(resolve => setTimeout(resolve, 300));
      } else {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
  }

  // ===== Gợi ý nhanh =====
  function renderQuickSuggestions(container) {
    const existing = container.querySelector('.bot-quick-chips');
    if (existing) existing.remove();

    const chips = document.createElement('div');
    chips.className = 'bot-quick-chips';
    quickSuggestions.forEach(s => {
      const chip = document.createElement('button');
      chip.className = 'bot-quick-chip';
      chip.textContent = s.label;
      chip.addEventListener('click', () => {
        // Xóa chips sau khi click
        chips.remove();
        // Gửi tin nhắn pretend user click
        appendMessage('user', s.label);
        pushHistory('user', s.label);
        const botMsg = createStreamingBotMessage();
        showThinkingInBubble(botMsg.bubble);
        setSendingState(true);
        callCerebras(s.action, botMsg.bubble)
          .catch(err => setBotMessageContent(botMsg.bubble, `[!] ${err.message}`))
          .finally(() => setSendingState(false));
      });
      chips.appendChild(chip);
    });
    container.appendChild(chips);
    scrollBottom();
  }

  // Hàm tìm danh mục theo tên gần đúng (fuzzy)
  function findCategoryFuzzy(name) {
    if (!name) return null;
    const cats = window._categories || [];
    if (!cats.length) return null;

    const search = name.toLowerCase().trim();

    // 1. Khớp chính xác
    let match = cats.find(c => c.name.toLowerCase() === search);
    if (match) return match;

    // 2. Chứa substring
    match = cats.find(c => c.name.toLowerCase().includes(search) || search.includes(c.name.toLowerCase()));
    if (match) return match;

    // 3. Tách từ và tính điểm khớp
    const searchWords = search.split(/\s+/).filter(w => w.length > 1);
    let best = null;
    let bestScore = 0;
    for (const c of cats) {
      const catWords = c.name.toLowerCase().split(/\s+/);
      let score = 0;
      for (const sw of searchWords) {
        for (const cw of catWords) {
          if (cw === sw) score += 3;
          else if (cw.includes(sw) || sw.includes(cw)) score += 1;
        }
      }
      if (score > bestScore) { bestScore = score; best = c; }
    }
    if (bestScore >= 1) return best;

    return null;
  }

  async function resolveCategoryId(categoryName, options = {}) {
    if (!window._categories?.length && typeof fetchCategories === 'function') {
      window._categories = await fetchCategories() || [];
    }

    if (categoryName) {
      const existing = findCategoryFuzzy(categoryName);
      if (existing) return existing._id;

      const cat = await createCategory({
        name: categoryName,
        date: options.date || new Date().toISOString(),
        color: options.color || '#6366f1',
        description: options.description || '',
      });
      if (typeof fetchCategories === 'function') {
        window._categories = await fetchCategories() || [];
      }
      return cat._id;
    }

    return (window._categories || [])[0]?._id;
  }

  async function selectTasksForBulkAction(params = {}) {
    let categoryId = params.categoryId;
    let categoryLabel = '';

    if (!categoryId && params.categoryName) {
      if (!window._categories?.length && typeof fetchCategories === 'function') {
        window._categories = await fetchCategories() || [];
      }
      const cat = findCategoryFuzzy(params.categoryName);
      if (!cat) {
        return {
          error: `Không tìm thấy danh mục "${params.categoryName}". Gợi ý: ${(window._categories || []).map(c => c.name).join(', ') || 'chưa có danh mục nào'}`,
        };
      }
      categoryId = cat._id;
      categoryLabel = cat.name;
    }

    const filters = {};
    if (params.date) filters.date = params.date;
    if (categoryId) filters.category = categoryId;
    if (params.onlyPending) filters.completed = 'false';
    if (params.onlyCompleted) filters.completed = 'true';

    const taskList = await fetchTasks(filters) || [];
    if (!taskList.length) return { error: 'Không có task nào phù hợp.' };

    let selectedTasks = [];
    if (Array.isArray(params.taskIds) && params.taskIds.length) {
      selectedTasks = taskList.filter(task => params.taskIds.includes(task._id));
    } else if (Array.isArray(params.taskNames) && params.taskNames.length) {
      selectedTasks = params.taskNames
        .map(name => {
          const search = String(name || '').toLowerCase().trim();
          return taskList.find(task => task.name?.toLowerCase() === search)
            || taskList.find(task => task.name?.toLowerCase().includes(search) || search.includes(task.name?.toLowerCase()));
        })
        .filter(Boolean);
    } else if (params.all) {
      selectedTasks = taskList;
    } else {
      const count = Math.max(1, Number(params.count || 1));
      const startIndex = Math.max(0, Number(params.startIndex || 1) - 1);
      selectedTasks = taskList.slice(startIndex, startIndex + count);
    }

    const tasks = Array.from(new Map(selectedTasks.map(task => [task._id, task])).values());
    if (!tasks.length) return { error: 'Mình chưa xác định được task nào. Bạn nói rõ tên task, số lượng task đầu, hoặc tất cả task nhé.' };

    return { tasks, categoryLabel };
  }

  // Parse ngày tương đối từ text thành YYYY-MM-DD
  function parseRelativeDate(text) {
    if (!text) return new Date().toISOString().split('T')[0];
    const t = text.toLowerCase().trim();
    const today = new Date();
    today.setHours(0,0,0,0);

    if (t === 'hôm nay' || t === 'today' || t === 'hom nay') return today.toISOString().split('T')[0];

    const d = new Date(today);
    if (t.includes('hôm qua') || t.includes('yesterday') || t === 'hom qua') { d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]; }
    if (t.includes('hôm kia') || t.includes('day before')) { d.setDate(d.getDate() - 2); return d.toISOString().split('T')[0]; }
    if (t.includes('ngày mai') || t.includes('tomorrow')) { d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; }
    if (t.includes('ngày kia')) { d.setDate(d.getDate() + 2); return d.toISOString().split('T')[0]; }

    // Tuần
    const weekMatch = t.match(/(\d+)\s*tuần\s*trước/);
    if (weekMatch) { d.setDate(d.getDate() - parseInt(weekMatch[1]) * 7); return d.toISOString().split('T')[0]; }
    if (t.includes('tuần trước') || t.includes('last week')) { d.setDate(d.getDate() - 7); return d.toISOString().split('T')[0]; }
    if (t.includes('tuần sau') || t.includes('next week')) { d.setDate(d.getDate() + 7); return d.toISOString().split('T')[0]; }

    // Số ngày trước
    const daysAgo = t.match(/(\d+)\s*ngày\s*trước/);
    if (daysAgo) { d.setDate(d.getDate() - parseInt(daysAgo[1])); return d.toISOString().split('T')[0]; }

    // Nếu là định dạng ngày tháng
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text)) {
      const parts = text.split('/');
      return `${parts[2]}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
    }

    // Mặc định: hôm nay
    return today.toISOString().split('T')[0];
  }

  // Parse khoảng ngày tương đối: "tuần qua", "tháng này", "7 ngày qua"
  function parseRelativeDateRange(text) {
    if (!text) {
      const today = new Date(); today.setHours(0,0,0,0);
      const to = today.toISOString().split('T')[0];
      today.setDate(today.getDate() - 7);
      return { dateFrom: today.toISOString().split('T')[0], dateTo: to };
    }
    const t = text.toLowerCase().trim();
    const today = new Date(); today.setHours(0,0,0,0);
    const fmt = (d) => d.toISOString().split('T')[0];

    // Tuần này (thứ 2 -> hôm nay)
    if (t.includes('tuần này') || t.includes('this week')) {
      const from = new Date(today);
      const dayOfWeek = from.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      from.setDate(from.getDate() + mondayOffset);
      return { dateFrom: fmt(from), dateTo: fmt(today) };
    }
    // Tuần qua / tuần trước (thứ 2 tuần trước -> CN tuần trước)
    if (t.includes('tuần qua') || t.includes('tuần trước') || t.includes('last week')) {
      const from = new Date(today);
      const dayOfWeek = from.getDay();
      const mondayOffset = dayOfWeek === 0 ? -13 : -6 - dayOfWeek;
      from.setDate(from.getDate() + mondayOffset);
      const to = new Date(from);
      to.setDate(to.getDate() + 6);
      to.setHours(23,59,59,999);
      return { dateFrom: fmt(from), dateTo: fmt(to) };
    }
    // Tháng này
    if (t.includes('tháng này') || t.includes('this month')) {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      return { dateFrom: fmt(from), dateTo: fmt(today) };
    }
    // Tháng trước
    if (t.includes('tháng trước') || t.includes('last month')) {
      const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const to = new Date(today.getFullYear(), today.getMonth(), 0);
      to.setHours(23,59,59,999);
      return { dateFrom: fmt(from), dateTo: fmt(to) };
    }
    // X ngày qua
    const daysMatch = t.match(/(\d+)\s*ngày\s*qua/);
    if (daysMatch) {
      const from = new Date(today);
      from.setDate(from.getDate() - parseInt(daysMatch[1]));
      return { dateFrom: fmt(from), dateTo: fmt(today) };
    }
    // X tuần qua
    const weeksMatch = t.match(/(\d+)\s*tuần\s*qua/);
    if (weeksMatch) {
      const from = new Date(today);
      from.setDate(from.getDate() - parseInt(weeksMatch[1]) * 7);
      return { dateFrom: fmt(from), dateTo: fmt(today) };
    }
    // Mặc định: 7 ngày qua
    const from = new Date(today);
    from.setDate(from.getDate() - 7);
    return { dateFrom: fmt(from), dateTo: fmt(today) };
  }

  // Hàm gọi API tạo task từ bot
  async function executeBotAction(actionType, params) {
    try {
      if (actionType === 'create_many_tasks') {
        const rawTasks = Array.isArray(params.tasks) ? params.tasks : [];
        const taskItems = rawTasks
          .map(task => ({
            name: task.name || task.taskName,
            reason: task.reason || params.reason || '',
            categoryName: task.categoryName || params.defaultCategoryName || params.categoryName,
            date: task.date || params.date,
            priority: task.priority || params.priority || 'medium',
            color: task.color || params.color,
          }))
          .filter(task => task.name?.trim());

        if (!taskItems.length) {
          return { success: false, message: 'Bạn muốn tạo những task nào? Hãy gửi giúp mình danh sách tên task.' };
        }

        const missingReasonTasks = taskItems.filter(task => !task.reason?.trim());
        if (missingReasonTasks.length) {
          pendingAction = {
            type: actionType,
            params: { ...params, tasks: taskItems },
          };
          const names = missingReasonTasks.map(task => `**"${task.name}"**`).join(', ');
          return {
            success: false,
            message: `Mình cần thêm **lý do** cho ${missingReasonTasks.length} task: ${names}. Bạn muốn dùng lý do gì?`,
          };
        }

        const createdTasks = [];
        for (const task of taskItems) {
          const date = task.date || new Date().toISOString();
          const categoryId = await resolveCategoryId(task.categoryName, {
            date,
            color: task.color || params.color,
          });

          if (!categoryId) {
            return {
              success: false,
              message: `Mình chưa tìm được danh mục cho task **"${task.name}"**. Bạn hãy nói rõ danh mục hoặc tạo danh mục trước nhé.`,
            };
          }

          const created = await createTask({
            name: task.name,
            reason: task.reason,
            category: categoryId,
            date,
            priority: task.priority || 'medium',
          });
          createdTasks.push(created);
        }

        return {
          success: true,
          tasks: createdTasks,
          message: `[OK] Đã tạo **${createdTasks.length} task**:\n${createdTasks.map(task => `- ${task.name}`).join('\n')}`,
        };
      }

      if (actionType === 'create_task_with_category') {
        if (!params.reason?.trim()) {
          pendingAction = { type: actionType, params };
          return {
            success: false,
            message: `Mình cần thêm **lý do** cho task **"${params.taskName}"** trong danh mục **"${params.categoryName}"**. Bạn muốn ghi lý do là gì?`,
          };
        }

        const date = params.date || new Date().toISOString();
        const cat = await createCategory({
          name: params.categoryName,
          date,
          color: params.color || '#6366f1',
          description: params.categoryDescription || '',
        });
        if (typeof fetchCategories === 'function') {
          window._categories = await fetchCategories() || [];
        }

        const task = await createTask({
          name: params.taskName,
          reason: params.reason || '',
          category: cat._id,
          date,
          priority: params.priority || 'medium',
        });

        return {
          success: true,
          category: cat,
          task,
          message: `[OK] Đã tạo danh mục **"${cat.name}"** và task **"${task.name}"** thành công! [detail:${task._id}:🔍 Xem chi tiết]`,
        };
      }

      if (actionType === 'create_task') {
        const catId = params.categoryId || await resolveCategoryId(params.categoryName, {
          date: params.date || new Date().toISOString(),
          color: params.color,
        });

        const task = await createTask({
          name: params.name,
          reason: params.reason || '',
          description: params.description || '',
          category: catId,
          date: params.date || new Date().toISOString(),
          priority: params.priority || 'medium',
        });
        return { success: true, task, message: `[OK] Đã tạo task **"${task.name}"** thành công! [detail:${task._id}:🔍 Xem chi tiết]` };
      }

      if (actionType === 'create_task' || actionType === 'create_task_with_category' || actionType === 'create_many_tasks' || actionType === 'create_category' || actionType === 'update_category' || actionType === 'delete_category' || actionType === 'update_task_progress' || actionType === 'update_tasks_status' || actionType === 'delete_tasks' || actionType === 'restore_deleted_task') {
        if (!botCurrentUser) {
          return { success: false, message: 'Bạn cần **đăng nhập** để thực hiện thao tác này. Gõ `/login` để đăng nhập nhé!' };
        }
        if (botCurrentUser.role === 'viewer') {
          return { success: false, message: 'Tài khoản của bạn chỉ có quyền **xem**. Hãy liên hệ admin để được cấp quyền ghi.' };
        }
      }

      if (actionType === 'create_category') {
        const cat = await createCategory({
          name: params.name,
          date: params.date || new Date().toISOString(),
          color: params.color || '#6366f1',
          description: params.description || '',
        });
        if (typeof fetchCategories === 'function') {
          window._categories = await fetchCategories() || [];
        }
        return { success: true, category: cat, message: `[OK] Đã tạo danh mục **"${cat.name}"** thành công!` };
      }

      if (actionType === 'list_tasks') {
        const date = parseRelativeDate(params.date);
        const fetched = await fetchTasks({ date });
        if (!fetched || !fetched.length) return { success: true, message: `Không có task nào cho ngày ${date}.` };
        const list = fetched.map(t => {
          const catName = t.category?.name || 'Không danh mục';
          const done = t.completed ? '[x]' : '[ ]';
          return `${done} **${t.name}** (${catName})`;
        }).join('\n');
        return { success: true, message: `Task ngày ${date}:\n${list}` };
      }

      if (actionType === 'update_tasks_status') {
        const selection = await selectTasksForBulkAction(params);
        if (selection.error) return { success: false, message: selection.error };

        const completed = params.completed !== false;
        for (const task of selection.tasks) {
          await updateTask(task._id, { completed });
        }

        const stateText = completed ? 'đánh dấu xong' : 'đánh dấu chưa xong';
        const scope = [
          params.date ? `ngày ${params.date}` : '',
          selection.categoryLabel ? `danh mục ${selection.categoryLabel}` : '',
        ].filter(Boolean).join(', ');
        const updatedNames = selection.tasks.map(task => `- ${task.name}`).join('\n');

        return {
          success: true,
          message: `[OK] Đã ${stateText} **${selection.tasks.length} task**${scope ? ` (${scope})` : ''}:\n${updatedNames}`,
        };
      }

      if (actionType === 'update_task_progress') {
        let task = null;
        if (params.taskId) {
          task = (window._tasks || []).find(t => t._id === params.taskId);
          if (!task) {
            const fetched = await fetchTasks({});
            window._tasks = fetched;
            task = fetched.find(t => t._id === params.taskId);
          }
        }
        if (!task && params.taskName) {
          const all = window._tasks?.length ? window._tasks : await fetchTasks({});
          const search = params.taskName.toLowerCase().trim();
          task = all.find(t => t.name?.toLowerCase().includes(search) || search.includes(t.name?.toLowerCase()));
        }
        if (!task) return { success: false, message: `Không tìm thấy task "${params.taskName || params.taskId}". Hãy tìm kiếm trước rồi thử lại.` };

        const progress = Math.max(0, Math.min(100, Number(params.progress) || 0));
        await updateTask(task._id, { progress });
        return { success: true, message: `[OK] Đã cập nhật tiến độ **"${task.name}"** lên **${progress}%**! [detail:${task._id}:🔍 Xem lại]` };
      }

      if (actionType === 'delete_tasks') {
        const selection = await selectTasksForBulkAction(params);
        if (selection.error) return { success: false, message: selection.error };

        deletedTaskSnapshots = selection.tasks.map(task => ({
          name: task.name,
          reason: task.reason || '',
          categoryName: task.category?.name || '',
          categoryId: task.category?._id || task.category || '',
          date: task.date,
          priority: task.priority || 'medium',
          completed: !!task.completed,
        }));

        for (const task of selection.tasks) {
          await deleteTask(task._id);
        }

        const scope = [
          params.date ? `ngày ${params.date}` : '',
          selection.categoryLabel ? `danh mục ${selection.categoryLabel}` : '',
        ].filter(Boolean).join(', ');
        const deletedNames = selection.tasks.map(task => `- ${task.name}`).join('\n');

        return {
          success: true,
          message: `[OK] Đã xoá **${selection.tasks.length} task**${scope ? ` (${scope})` : ''}:\n${deletedNames}`,
        };
      }

      if (actionType === 'restore_deleted_tasks') {
        if (!deletedTaskSnapshots.length) {
          return {
            success: false,
            message: 'Mình chưa có snapshot task vừa xoá để phục hồi. Chỉ khôi phục được các task bị xoá bằng chatbot trong phiên hiện tại.',
          };
        }

        const restoredTasks = [];
        for (const snapshot of deletedTaskSnapshots) {
          const categoryId = snapshot.categoryId || await resolveCategoryId(snapshot.categoryName, {
            date: snapshot.date || new Date().toISOString(),
          });

          if (!categoryId) {
            return {
              success: false,
              message: `Mình chưa khôi phục được task **"${snapshot.name}"** vì thiếu danh mục.`,
            };
          }

          const restored = await createTask({
            name: snapshot.name,
            reason: snapshot.reason || 'Khôi phục từ task đã xoá',
            category: categoryId,
            date: snapshot.date || new Date().toISOString(),
            priority: snapshot.priority || 'medium',
          });

          if (snapshot.completed && typeof updateTask === 'function') {
            await updateTask(restored._id, { completed: true });
            restored.completed = true;
          }

          restoredTasks.push(restored);
        }

        const restoredNames = restoredTasks.map(task => `- ${task.name}`).join('\n');
        deletedTaskSnapshots = [];

        return {
          success: true,
          message: `[OK] Đã phục hồi **${restoredTasks.length} task**:\n${restoredNames}`,
        };
      }

      if (actionType === 'restore_deleted_task') {
        // Lấy danh sách task đã xoá từ API
        const res = await fetch('/api/tasks/deleted', { headers: { 'Content-Type': 'application/json' } });
        const json = await res.json();
        const deletedTasks = json.success ? (json.data || []) : [];
        if (!deletedTasks.length) return { success: false, message: 'Không có task nào đã xoá để phục hồi.' };

        let task = null;
        if (params.taskId) {
          task = deletedTasks.find(t => t._id === params.taskId);
        }
        if (!task && params.taskName) {
          const search = params.taskName.toLowerCase().trim();
          task = deletedTasks.find(t => t.name?.toLowerCase().includes(search) || search.includes(t.name?.toLowerCase()));
        }
        if (!task) {
          const list = deletedTasks.map(t => `- **${t.name}** (#${(t._id||'').slice(-6)})`).join('\n');
          return { success: false, message: `Không tìm thấy task "${params.taskName || params.taskId}" trong danh sách đã xoá:\n${list}` };
        }

        const restoreRes = await fetch(`/api/tasks/${task._id}/restore`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
        });
        const restoreJson = await restoreRes.json();
        if (!restoreJson.success) return { success: false, message: restoreJson.message };

        return { success: true, message: `[OK] Đã phục hồi task **"${task.name}"**! [detail:${task._id}:🔍 Xem]` };
      }

      if (actionType === 'get_task_stats') {
        let categoryId = params.categoryId;
        let categoryLabel = '';

        if (!categoryId && params.categoryName) {
          if (!window._categories?.length && typeof fetchCategories === 'function') {
            window._categories = await fetchCategories() || [];
          }
          const cat = findCategoryFuzzy(params.categoryName);
          if (!cat) {
            return { success: false, message: `Không tìm thấy danh mục "${params.categoryName}". Gợi ý: ${(window._categories || []).map(c => c.name).join(', ') || 'chưa có danh mục nào'}` };
          }
          categoryId = cat._id;
          categoryLabel = cat.name;
        }

        // Parse khoảng ngày nếu có dateRange (tuần qua, tháng này,...)
        let dateFrom, dateTo;
        if (params.dateRange) {
          const range = parseRelativeDateRange(params.dateRange);
          dateFrom = range.dateFrom;
          dateTo = range.dateTo;
        } else if (params.dateFrom || params.dateTo) {
          dateFrom = params.dateFrom ? parseRelativeDate(params.dateFrom) : null;
          dateTo = params.dateTo ? parseRelativeDate(params.dateTo) : null;
        } else if (params.date) {
          dateFrom = parseRelativeDate(params.date);
        }

        // Dùng API advanced search để lọc theo khoảng ngày
        const searchParams = new URLSearchParams();
        if (dateFrom) searchParams.set('dateFrom', dateFrom);
        if (dateTo) searchParams.set('dateTo', dateTo);
        if (categoryId) searchParams.set('category', categoryId);
        if (params.completed !== undefined) searchParams.set('completed', String(params.completed));

        const res = await fetch(`/api/tasks/search/advanced?${searchParams.toString()}`);
        const json = await res.json();
        const taskList = json.success ? (json.data || []) : [];
        const total = taskList.length;
        const completed = taskList.filter(t => t.completed).length;
        const pending = total - completed;
        const priorityCounts = taskList.reduce((acc, task) => {
          const key = task.priority || 'medium';
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {});
        const categoryCounts = taskList.reduce((acc, task) => {
          const name = task.category?.name || 'Không danh mục';
          acc[name] = (acc[name] || 0) + 1;
          return acc;
        }, {});
        const topCategories = Object.entries(categoryCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([name, count]) => `- ${name}: ${count}`)
          .join('\n');

        const scope = [
          params.date ? `ngày **${params.date}**` : 'tất cả ngày',
          categoryLabel ? `danh mục **${categoryLabel}**` : '',
        ].filter(Boolean).join(', ');

        const message = [
          `Thống kê task (${scope}):`,
          `- Tổng task: **${total}**`,
          `- Đã xong: **${completed}**`,
          `- Chưa xong: **${pending}**`,
          `- Ưu tiên cao: **${priorityCounts.high || 0}**`,
          `- Ưu tiên vừa: **${priorityCounts.medium || 0}**`,
          `- Ưu tiên thấp: **${priorityCounts.low || 0}**`,
          topCategories && total > 1 ? `Danh mục nhiều task:\n${topCategories}` : '',
          taskList.length > 0 ? `\nDanh sách task:` : '',
          ...taskList.map(t => {
            const done = t.completed ? '[x]' : '[ ]';
            const catName = t.category?.name || '';
            return `${done} **${t.name}** ${catName && !categoryLabel ? '(' + catName + ')' : ''} - ${t.priority || 'medium'} - ${t.progress || 0}% [detail:${t._id}:🔍 Xem]`;
          }),
        ].filter(Boolean).join('\n');

        return { success: true, message };
      }

      if (actionType === 'update_category') {
        const cat = findCategoryFuzzy(params.categoryName);
        if (!cat) return { success: false, message: `Không tìm thấy danh mục "${params.categoryName}". Gợi ý: ${(window._categories||[]).map(c=>c.name).join(', ') || 'chưa có danh mục nào'}` };
        const updates = {};
        if (params.newName) updates.name = params.newName;
        if (params.color) updates.color = params.color;
        if (params.description !== undefined) updates.description = params.description;
        await updateCategory(cat._id, updates);
        if (typeof fetchCategories === 'function') {
          window._categories = await fetchCategories() || [];
        }
        return { success: true, message: `[OK] Đã sửa danh mục thành **"${updates.name || cat.name}"**!` };
      }

      if (actionType === 'delete_category') {
        const cat = findCategoryFuzzy(params.categoryName);
        if (!cat) return { success: false, message: `Không tìm thấy danh mục "${params.categoryName}". Gợi ý: ${(window._categories||[]).map(c=>c.name).join(', ') || 'chưa có danh mục nào'}` };
        // Confirm trước khi xoá
        if (!(await botConfirm('Xoá danh mục', `Xoá "${cat.name}" và TẤT CẢ task bên trong? Không thể hoàn tác!`, 'Xoá', 'Huỷ'))) {
          return { success: false, message: 'Đã huỷ xoá danh mục.' };
        }
        await deleteCategory(cat._id);
        if (typeof fetchCategories === 'function') {
          window._categories = await fetchCategories() || [];
        }
        return { success: true, message: `[OK] Đã xoá danh mục **"${cat.name}"** và các task liên quan.` };
      }

      if (actionType === 'query_db') {
        const collection = params.collection;
        const filter = params.filter || {};
        const sort = params.sort || { date: -1 };
        const limit = params.limit || 50;
        const res = await fetch(`/api/${collection}/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filter, sort, limit, includeDeleted: params.includeDeleted || false }),
        });
        const json = await res.json();
        if (!json.success) return { success: false, message: json.message };
        const data = json.data || [];
        if (!data.length) return { success: true, message: `Không tìm thấy kết quả nào phù hợp trong ${collection}. Thử mở rộng tìm kiếm hoặc kiểm tra lại ngày tháng nhé!` };

        if (collection === 'tasks') {
          const list = data.map(t => {
            const catName = t.category?.name || '';
            const done = t.completed ? '[x]' : '[ ]';
            return `${done} **${t.name}** ${catName ? '(' + catName + ')' : ''} - ${t.priority || 'medium'} - ${t.progress || 0}% [detail:${t._id}:🔍 Xem chi tiết]`;
          }).join('\n');
          return { success: true, message: `Kết quả ${collection} (${data.length}):\n${list}` };
        }
        if (collection === 'categories') {
          const list = data.map(c => `📁 **${c.name}** - ${c.color || ''}`).join('\n');
          return { success: true, message: `Danh sách danh mục (${data.length}):\n${list}` };
        }
        return { success: true, message: `Tìm thấy ${data.length} kết quả trong ${collection}.` };
      }

      return { success: false, message: 'Không rõ hành động.' };
    } catch (err) {
      return { success: false, message: `Lỗi: ${err.message}` };
    } finally {
      // Tự động refresh giao diện chính sau mỗi action
      if (typeof loadAll === 'function') {
        try { await loadAll(); } catch (e) { /* bỏ qua */ }
      }
    }
  }

  function createMessage(role, text) {
    const container = document.createElement('div');
    container.className = `message-container ${role === 'bot' ? 'bot-msg-container' : 'user-msg-container'}`;
    const bubble = document.createElement('div');
    bubble.className = `message ${role}`;
    bubble.textContent = text;
    container.appendChild(bubble);
    messages.appendChild(container);
    scrollBottom();
    return { container, bubble };
  }

  function appendMessage(role, text) {
    if (!messages || !text.trim()) return null;
    return createMessage(role, text);
  }

  function createStreamingBotMessage() {
    return createMessage('bot', '');
  }

  function showThinkingInBubble(targetBubble) {
    targetBubble.innerHTML = '<div class="bot-thinking-dots"><span></span><span></span><span></span></div>';
  }

  async function continuePendingAction(userText, targetBubble) {
    if (!pendingAction) return false;

    const current = pendingAction;
    pendingAction = null;

    const reason = userText.trim();
    if (!reason) {
      pendingAction = current;
      const message = 'Bạn nhập giúp mình lý do cho task này nhé.';
      setBotMessageContent(targetBubble, message);
      pushHistory('assistant', message);
      return true;
    }

    const nextParams = { ...current.params, reason };
    const result = await executeBotAction(current.type, nextParams);
    const message = result.message || 'Đã tiếp tục tác vụ.';
    setBotMessageContent(targetBubble, message);
    pushHistory('assistant', message);
    return true;
  }

  function setStatus(state) {
    if (!statusDot || !statusText) return;
    statusDot.className = 'status-dot ' + state;
    const labels = {
      online: chatbotThemes[currentThemeKey]?.persona || 'Đang trực tuyến',
      processing: 'Đang xử lý...',
      busy: 'Đang bận',
    };
    statusText.textContent = labels[state] || 'Đang trực tuyến';
  }

  function showBubble(text, duration = 4000) {
    if (!bubble) return;
    bubble.textContent = text;
    bubble.classList.add('show');
    clearTimeout(bubble._timeout);
    bubble._timeout = setTimeout(() => bubble.classList.remove('show'), duration);
  }

  // ===== Custom Confirm =====
  function botConfirm(title, msg, yesText, noText) {
    return new Promise((resolve) => {
      document.getElementById('bot-confirm-title').textContent = title || 'Xác nhận';
      document.getElementById('bot-confirm-msg').textContent = msg || 'Bạn có chắc không?';
      document.getElementById('bot-confirm-yes').textContent = yesText || 'Đồng ý';
      document.getElementById('bot-confirm-no').textContent = noText || 'Huỷ';
      const modal = document.getElementById('bot-confirm-modal');
      const yesBtn = document.getElementById('bot-confirm-yes');
      const noBtn = document.getElementById('bot-confirm-no');

      // Tạm gỡ listener resetChat cũ để tránh xung đột
      const oldYesHandler = resetChat;
      const oldNoHandler = () => { modal.style.display = 'none'; };
      yesBtn.removeEventListener('click', oldYesHandler);
      noBtn.removeEventListener('click', oldNoHandler);

      const onYes = () => {
        modal.style.display = 'none';
        yesBtn.removeEventListener('click', onYes);
        noBtn.removeEventListener('click', onNo);
        // Gắn lại listener cũ
        yesBtn.addEventListener('click', oldYesHandler);
        noBtn.addEventListener('click', oldNoHandler);
        resolve(true);
      };
      const onNo = () => {
        modal.style.display = 'none';
        yesBtn.removeEventListener('click', onYes);
        noBtn.removeEventListener('click', onNo);
        yesBtn.addEventListener('click', oldYesHandler);
        noBtn.addEventListener('click', oldNoHandler);
        resolve(false);
      };
      yesBtn.addEventListener('click', onYes);
      noBtn.addEventListener('click', onNo);
      modal.style.display = 'flex';
    });
  }

  function showToast(msg) {
    if (!toastStack) return;
    const toast = document.createElement('div');
    toast.className = 'bot-toast';
    toast.innerHTML = `<div class="bot-toast-message">${msg}</div><div class="bot-toast-progress"></div>`;
    toastStack.prepend(toast);
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    setTimeout(() => { toast.classList.remove('is-visible'); setTimeout(() => toast.remove(), 250); }, 4000);
  }

  function setSendingState(sending) {
    isSending = sending;
    if (input) input.disabled = sending;
    if (sendBtn) {
      if (sending) {
        // Chuyển sang nút dừng
        sendBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"></rect></svg>';
        sendBtn.classList.add('stop-btn');
        sendBtn.disabled = false;
        sendBtn.title = 'Dừng';
      } else {
        // Trở về nút gửi
        sendBtn.innerHTML = sendBtnOriginalHTML;
        sendBtn.classList.remove('stop-btn');
        sendBtn.disabled = false;
        sendBtn.title = 'Gửi';
      }
    }
    setStatus(sending ? 'processing' : 'online');
  }

  // ===== Stream reader có xử lý tool calls =====
  async function readStreamWithTools(response, targetBubble) {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Không thể đọc stream.');

    const decoder = new TextDecoder();
    let aggregated = '';
    let reasoningAggregated = '';
    let buffer = '';
    let toolCalls = [];
    let finishReason = '';
    let lastRenderTime = 0;
    const renderThrottle = 50; // ms giữa các lần render
    let hasShownThinking = false; // Chỉ hiển thị "Đang suy nghĩ..." một lần

    while (true) {
      // Kiểm tra nếu người dùng đã bấm dừng
      if (abortController?.signal.aborted) {
        reader.cancel();
        throw new Error('Đã dừng.');
      }
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;

        try {
          const json = JSON.parse(payload);
          const choice = json.choices?.[0];
          const delta = choice?.delta;
          finishReason = choice?.finish_reason || finishReason;

          // Stream reasoning text (Kimi thinking) - hiển thị suy nghĩ realtime
          const reasoningText = delta?.reasoning || '';
          if (reasoningText && !aggregated) {
            reasoningAggregated += reasoningText;
            if (!hasShownThinking) hasShownThinking = true;
            const now = Date.now();
            if (now - lastRenderTime > renderThrottle) {
              targetBubble.innerHTML =
                '<details open style="opacity:0.75;font-size:0.9em;">' +
                '<summary style="cursor:pointer;color:#888;">💭 Đang suy nghĩ...</summary>' +
                '<div style="margin-top:4px;padding:6px 10px;background:rgba(0,0,0,0.04);border-radius:6px;white-space:pre-wrap;font-style:italic;">' +
                escapeHtml(reasoningAggregated) +
                '</div></details>';
              scrollBottom();
              lastRenderTime = now;
            }
          }

          // Gom tool calls từ delta
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index || 0;
              if (!toolCalls[idx]) {
                toolCalls[idx] = { id: tc.id || '', function: { name: '', arguments: '' } };
              }
              if (tc.id) toolCalls[idx].id = tc.id;
              if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
              if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
            }
          }

          const text = delta?.content || '';
          if (text) {
            aggregated += text;
            // Throttle render để tránh render quá nhiều
            const now = Date.now();
            if (now - lastRenderTime > renderThrottle) {
              targetBubble.innerHTML = renderBotMarkdown(aggregated);
              scrollBottom();
              lastRenderTime = now;
            }
          }
        } catch (e) { /* bỏ qua */ }
      }
    }

    // Xử lý tool calls dạng text: <|functions.xxx|args|>
    const textToolRegex = /<\|functions\.(\w+)\|([^|]*)\|>/g;
    let textMatch;
    while ((textMatch = textToolRegex.exec(aggregated)) !== null) {
      const funcName = textMatch[1];
      const argsStr = textMatch[2];
      let args = {};
      try { args = JSON.parse(argsStr || '{}'); } catch (e) { /* */ }
      aggregated = aggregated.replace(textMatch[0], '');
      toolCalls.push({ function: { name: funcName, arguments: argsStr || '{}' } });
    }

    // Render lần cuối để đảm bảo hiển thị đầy đủ
    if (aggregated.trim()) {
      targetBubble.innerHTML = renderBotMarkdown(aggregated.trim());
      scrollBottom();
    }

    // Gọi tool nếu có
    if ((finishReason === 'tool_calls' || toolCalls.length > 0) && toolCalls.length > 0) {
      // Bot đã trả lời trước (aggregated), giờ thực thi action

      let toolResult = '';
      for (const tc of toolCalls) {
        if (!tc.function?.name) continue;
        let args = {};
        try { args = JSON.parse(tc.function.arguments || '{}'); } catch (e) { /* */ }

        const result = await executeBotAction(tc.function.name, args);
        toolResult += (toolResult ? '\n\n' : '') + (result.message || '');
      }

      if (toolResult) {
        // Thêm kết quả action vào sau câu trả lời ban đầu
        const finalText = (aggregated ? aggregated + '\n\n' : '') + toolResult;
        setBotMessageContent(targetBubble, finalText);
        pushHistory('assistant', finalText);
      }
      return aggregated;
    }

    // Thêm badge model cho trường hợp không có tool calls
    if (aggregated.trim()) {
      const container = targetBubble.closest('.message-container');
      if (container) {
        const oldBadge = container.querySelector('.bot-model-badge');
        if (oldBadge) oldBadge.remove();

        const config = modelConfigs[currentModelType];
        const badge = document.createElement('div');
        badge.className = 'bot-model-badge';
        badge.style.cssText = 'margin-top:4px;padding:2px 8px;background:rgba(0,0,0,0.05);border-radius:4px;font-size:9px;opacity:0.5;width:fit-content;';
        badge.textContent = config.name;
        container.appendChild(badge);
      }
      pushHistory('assistant', aggregated);
    }
    return aggregated;
  }

  // ===== Tool definitions cho Cerebras =====
  const tools = [
    {
      type: 'function',
      function: {
        name: 'create_many_tasks',
        description: 'Tạo nhiều task cùng lúc trong một action. Dùng khi người dùng liệt kê từ 2 task trở lên, có thể dùng chung một danh mục hoặc mỗi task có danh mục riêng.',
        parameters: {
          type: 'object',
          properties: {
            defaultCategoryName: { type: 'string', description: 'Tên danh mục dùng chung cho các task nếu task không có categoryName riêng' },
            categoryName: { type: 'string', description: 'Alias của defaultCategoryName, tên danh mục dùng chung' },
            reason: { type: 'string', description: 'Lý do dùng chung cho các task nếu từng task không có reason riêng. Bắt buộc theo API; nếu thiếu thì hỏi thêm.' },
            date: { type: 'string', description: 'Ngày dùng chung cho các task (YYYY-MM-DD), mặc định hôm nay' },
            priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Mức ưu tiên dùng chung, mặc định medium' },
            color: { type: 'string', description: 'Màu hex khi cần tạo danh mục mới' },
            tasks: {
              type: 'array',
              description: 'Danh sách task cần tạo',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Tên task' },
                  reason: { type: 'string', description: 'Lý do riêng của task. Nếu thiếu sẽ dùng reason chung hoặc hỏi thêm.' },
                  categoryName: { type: 'string', description: 'Danh mục riêng của task nếu khác danh mục chung' },
                  date: { type: 'string', description: 'Ngày riêng của task (YYYY-MM-DD)' },
                  priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Mức ưu tiên riêng của task' },
                },
                required: ['name'],
              },
            },
          },
          required: ['tasks'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'create_task_with_category',
        description: 'Tạo đồng thời một danh mục mới và một task mới thuộc danh mục đó trong cùng một action. Dùng khi người dùng nói muốn tạo task kèm danh mục mới.',
        parameters: {
          type: 'object',
          properties: {
            categoryName: { type: 'string', description: 'Tên danh mục mới cần tạo' },
            taskName: { type: 'string', description: 'Tên task mới cần tạo trong danh mục mới' },
            reason: { type: 'string', description: 'Lý do / mô tả cho task. Bắt buộc theo API; nếu người dùng chưa cung cấp thì hỏi thêm.' },
            date: { type: 'string', description: 'Ngày của danh mục và task (YYYY-MM-DD), mặc định hôm nay' },
            priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Mức ưu tiên của task' },
            color: { type: 'string', description: 'Mã màu hex cho danh mục mới, mặc định #6366f1' },
            categoryDescription: { type: 'string', description: 'Mô tả danh mục mới' },
          },
          required: ['categoryName', 'taskName'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'create_task',
        description: 'Tạo task mới. Gọi NGAY khi user muốn thêm task, KHÔNG hỏi lại reason/description vì chúng optional.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Tên task (bắt buộc)' },
            reason: { type: 'string', description: 'Lý do (optional)' },
            description: { type: 'string', description: 'Mô tả chi tiết (optional)' },
            categoryName: { type: 'string', description: 'Tên danh mục' },
            date: { type: 'string', description: 'Ngày (YYYY-MM-DD)' },
            priority: { type: 'string', enum: ['low', 'medium', 'high'] },
          },
          required: ['name'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'create_category',
        description: 'Tạo danh mục mới. Gọi khi người dùng muốn thêm danh mục ngày.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Tên danh mục' },
            date: { type: 'string', description: 'Ngày (YYYY-MM-DD), mặc định hôm nay' },
            color: { type: 'string', description: 'Mã màu hex, mặc định #6366f1' },
            description: { type: 'string', description: 'Mô tả danh mục' },
          },
          required: ['name'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_tasks',
        description: 'Liệt kê danh sách task. Gọi khi người dùng muốn xem task theo ngày.',
        parameters: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'Ngày cần xem (YYYY-MM-DD), mặc định hôm nay' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_task_stats',
        description: 'Thống kê task + danh sách chi tiết. Trả về số liệu tổng hợp KÈM danh sách từng task. Hỗ trợ lọc theo ngày, danh mục, trạng thái. Dùng khi người dùng hỏi "có bao nhiêu task", "thống kê", "task trong danh mục X".',
        parameters: {
          type: 'object',
          properties: {
            dateRange: { type: 'string', description: 'Khoảng thời gian: "tuần qua", "tuần này", "tháng này", "tháng trước", "7 ngày qua", "30 ngày qua". ƯU TIÊN dùng cái này thay vì date.' },
            date: { type: 'string', description: 'Ngày đơn lẻ (YYYY-MM-DD). Ít ưu tiên hơn dateRange.' },
            dateFrom: { type: 'string', description: 'Ngày bắt đầu khoảng (YYYY-MM-DD)' },
            dateTo: { type: 'string', description: 'Ngày kết thúc khoảng (YYYY-MM-DD)' },
            categoryName: { type: 'string', description: 'Tên danh mục, có thể gần đúng' },
            completed: { type: 'boolean', description: 'Lọc trạng thái hoàn thành' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'update_tasks_status',
        description: 'Cập nhật trạng thái hoàn thành/chưa hoàn thành cho một hoặc nhiều task. Dùng cho câu như "đánh dấu xong 5 task đầu", "hoàn thành tất cả task hôm nay", "đánh dấu chưa xong task A". Không hỏi lại nếu người dùng đã nói rõ số lượng/vị trí như 5 task đầu.',
        parameters: {
          type: 'object',
          properties: {
            completed: { type: 'boolean', description: 'true để đánh dấu xong/hoàn thành, false để đánh dấu chưa xong' },
            count: { type: 'number', description: 'Số task cần cập nhật khi chọn theo thứ tự, ví dụ 5 trong "5 task đầu"' },
            startIndex: { type: 'number', description: 'Vị trí bắt đầu theo danh sách, tính từ 1. Mặc định 1 cho "task đầu"' },
            all: { type: 'boolean', description: 'true nếu người dùng muốn cập nhật tất cả task phù hợp' },
            date: { type: 'string', description: 'Ngày cần lọc (YYYY-MM-DD), nếu người dùng nói hôm nay thì dùng ngày hôm nay' },
            categoryName: { type: 'string', description: 'Tên danh mục cần lọc nếu có' },
            categoryId: { type: 'string', description: 'ID danh mục nếu đã biết' },
            taskNames: {
              type: 'array',
              description: 'Danh sách tên task cần cập nhật nếu người dùng nêu tên',
              items: { type: 'string' },
            },
            taskIds: {
              type: 'array',
              description: 'Danh sách ID task cần cập nhật nếu đã biết',
              items: { type: 'string' },
            },
            onlyPending: { type: 'boolean', description: 'true nếu chỉ muốn lấy task chưa xong trước khi cập nhật' },
            onlyCompleted: { type: 'boolean', description: 'true nếu chỉ muốn lấy task đã xong trước khi cập nhật' },
          },
          required: ['completed'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'delete_tasks',
        description: 'Xoá một hoặc nhiều task. Dùng cho câu như "xoá tất cả các task hôm nay", "xoá 5 task đầu", "xoá task ăn cơm", "xoá tất cả task trong danh mục ăn uống". Không xoá danh mục trừ khi người dùng yêu cầu xoá danh mục.',
        parameters: {
          type: 'object',
          properties: {
            count: { type: 'number', description: 'Số task cần xoá khi chọn theo thứ tự, ví dụ 5 trong "xoá 5 task đầu"' },
            startIndex: { type: 'number', description: 'Vị trí bắt đầu theo danh sách, tính từ 1. Mặc định 1 cho "task đầu"' },
            all: { type: 'boolean', description: 'true nếu người dùng muốn xoá tất cả task phù hợp' },
            date: { type: 'string', description: 'Ngày cần lọc (YYYY-MM-DD). Nếu người dùng nói hôm nay thì dùng ngày hôm nay.' },
            categoryName: { type: 'string', description: 'Tên danh mục cần lọc nếu có' },
            categoryId: { type: 'string', description: 'ID danh mục nếu đã biết' },
            taskNames: {
              type: 'array',
              description: 'Danh sách tên task cần xoá nếu người dùng nêu tên',
              items: { type: 'string' },
            },
            taskIds: {
              type: 'array',
              description: 'Danh sách ID task cần xoá nếu đã biết',
              items: { type: 'string' },
            },
            onlyPending: { type: 'boolean', description: 'true nếu chỉ xoá task chưa xong' },
            onlyCompleted: { type: 'boolean', description: 'true nếu chỉ xoá task đã xong' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'restore_deleted_tasks',
        description: 'Phục hồi các task vừa bị xoá bởi chatbot trong phiên hiện tại. Dùng khi người dùng nói "phục hồi task đã xoá", "khôi phục lại task vừa xoá", "undo xoá task".',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'update_task_progress',
        description: 'Cập nhật TIẾN ĐỘ (%) cho MỘT task. Dùng khi người dùng nói "cho task X lên Y%", "cập nhật tiến độ task A thành B%", "set progress Z thành W%". ƯU TIÊN dùng taskId đã biết từ kết quả query_db trước đó.',
        parameters: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'ID của task (nếu đã biết từ kết quả trước)' },
            taskName: { type: 'string', description: 'Tên task cần cập nhật (nếu chưa biết ID)' },
            progress: { type: 'number', description: 'Tiến độ mới (0-100)' },
          },
          required: ['progress'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'update_category',
        description: 'Sửa tên/màu/mô tả danh mục. Gọi khi người dùng muốn sửa danh mục. Cần biết tên danh mục hiện tại.',
        parameters: {
          type: 'object',
          properties: {
            categoryName: { type: 'string', description: 'Tên danh mục cần sửa (tên hiện tại)' },
            newName: { type: 'string', description: 'Tên mới cho danh mục' },
            color: { type: 'string', description: 'Mã màu hex mới' },
            description: { type: 'string', description: 'Mô tả mới' },
          },
          required: ['categoryName'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'delete_category',
        description: 'Xoá danh mục và tất cả task trong đó. Gọi khi người dùng muốn xoá danh mục. CẢNH BÁO: không thể hoàn tác!',
        parameters: {
          type: 'object',
          properties: {
            categoryName: { type: 'string', description: 'Tên danh mục cần xoá' },
          },
          required: ['categoryName'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'query_db',
        description: 'Truy vấn database động với MongoDB filter. Dùng khi cần lọc phức tạp không có tool riêng.',
        parameters: {
          type: 'object',
          properties: {
            collection: { type: 'string', enum: ['tasks', 'categories'], description: 'tasks hoặc categories' },
            filter: { type: 'object', description: 'Filter MongoDB, VD: {"completed":true,"priority":"high"}' },
            sort: { type: 'object', description: 'Sort, VD: {"date":-1}' },
            limit: { type: 'number', description: 'Số kết quả, mặc định 50' },
            includeDeleted: { type: 'boolean', description: 'true để bao gồm task đã xoá mềm. Dùng khi tìm task đã xoá để phục hồi.' },
          },
          required: ['collection'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'restore_deleted_task',
        description: 'Khôi phục MỘT task đã xoá (soft delete) từ database. Dùng khi người dùng nói "phục hồi task X", "khôi phục task đã xoá tên Y". Tự tìm task trong danh sách đã xoá rồi restore.',
        parameters: {
          type: 'object',
          properties: {
            taskName: { type: 'string', description: 'Tên task cần phục hồi (tìm gần đúng trong task đã xoá)' },
            taskId: { type: 'string', description: 'ID task cần phục hồi (nếu đã biết)' },
          },
        },
      },
    },
  ];

  function getThemeInstruction() {
    return chatbotThemes[currentThemeKey]?.instruction || chatbotThemes.blue.instruction;
  }

  async function callCerebras(prompt, targetBubble) {
    await ensureConfig();

    // Lấy config model hiện tại
    const config = modelConfigs[currentModelType];
    const keys = config.getKeys();

    if (!keys.length) {
      throw new Error(`Chưa có API key cho ${config.name}. Kiểm tra file .env.`);
    }

    let lastError = null;
    // Thử tối đa số key có sẵn
    for (let attempt = 0; attempt < keys.length; attempt++) {
      const key = keys[attempt % keys.length];

      const body = {
        model: config.model,
        stream: true,
        tools: tools,
        tool_choice: 'auto',
        messages: [
          { role: 'system', content: getSystemPrompt() },
          ...chatHistory,
        ],
      };

      // OpenRouter models cần max_tokens
      if (config.apiBase.includes('openrouter')) {
        body.max_tokens = 1000;
      }

      try {
        const streamRes = await fetch(`${config.apiBase}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:3002',
            'X-Title': 'NoteTasks Chatbot',
          },
          body: JSON.stringify(body),
          signal: abortController?.signal,
        });

        if (streamRes.status === 429) {
          lastError = new Error(`${config.name} bị rate limit, đang thử lại...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }

        if (!streamRes.ok) {
          const errText = await streamRes.text();
          throw new Error(`Lỗi ${config.name} (${streamRes.status}): ${errText.slice(0, 200)}`);
        }

        return await readStreamWithTools(streamRes, targetBubble);
      } catch (err) {
        if (err.name === 'AbortError') {
          throw new Error('Đã dừng.');
        }
        if (err.message.includes('rate limit')) {
          lastError = err;
          continue;
        }
        throw err;
      }
    }

    throw lastError || new Error(`Tất cả API key ${config.name} đều không khả dụng.`);
  }

  async function sendMessage() {
    const text = input?.value.trim() || '';
    if (!text || isSending) return;

    // Kiểm tra giới hạn 20 câu hỏi
    if (messageCount >= maxMessages) {
      confirmModal.style.display = 'flex';
      return;
    }

    appendMessage('user', text);
    pushHistory('user', text);
    messageCount++;
    updateMessageCount();
    input.value = '';
    input.style.height = '40px';

    const botMessage = createStreamingBotMessage();
    showThinkingInBubble(botMessage.bubble);

    setSendingState(true);
    abortController = new AbortController();
    try {
      // Xử lý command /edit /del
      const cmdResult = await handleCommand(text, botMessage.bubble);
      if (cmdResult) { setSendingState(false); input?.focus(); return; }

      const handledPending = await continuePendingAction(text, botMessage.bubble);
      if (!handledPending) {
        await callCerebras(text, botMessage.bubble);
      }
    } catch (error) {
      const msg = error.message === 'Đã dừng.' ? '⏹ Đã dừng.' : `[!] ${error.message}`;
      setBotMessageContent(botMessage.bubble, msg);
    } finally {
      abortController = null;
      setSendingState(false);
      input?.focus();
    }
  }

  // ===== Command Handler =====
  async function handleCommand(text, targetBubble) {
    const t = text.trim();

    // /model - chuyển đổi model
    if (t === '/model' || t.startsWith('/model ')) {
      const parts = t.split(/\s+/);
      if (parts.length === 1) {
        // Hiển thị model hiện tại + danh sách dạng link bấm được
        const current = modelConfigs[currentModelType];
        let html = `<p>Model hiện tại: <strong>${escapeHtml(current.name)}</strong></p><ul>`;

        Object.entries(modelConfigs).forEach(([key, cfg]) => {
          const isActive = key === currentModelType;
          if (isActive) {
            html += `<li><strong>${escapeHtml(cfg.name)}</strong> ✓</li>`;
          } else {
            html += `<li><a href="#" data-model="${key}" style="text-decoration:none;color:#6c8ebf;cursor:pointer;">${escapeHtml(cfg.name)}</a></li>`;
          }
        });
        html += '</ul>';

        targetBubble.innerHTML = html;

        // Gắn sự kiện click cho các link model
        targetBubble.querySelectorAll('a[data-model]').forEach(link => {
          link.addEventListener('click', (e) => {
            e.preventDefault();
            const key = link.dataset.model;
            const cfg = modelConfigs[key];
            currentModelType = key;
            localStorage.setItem('chatbot-model', key);
            setBotMessageContent(targetBubble, `✅ Đã chuyển sang **${cfg.name}**!`);
          });
        });

        scrollBottom();
        return true;
      }

      const targetModel = parts[1].toLowerCase();
      if (!modelConfigs[targetModel]) {
        const available = Object.keys(modelConfigs).join(', ');
        setBotMessageContent(targetBubble, `Model "${targetModel}" không tồn tại. Có: ${available}`);
        return true;
      }

      currentModelType = targetModel;
      localStorage.setItem('chatbot-model', currentModelType);
      const newConfig = modelConfigs[currentModelType];
      setBotMessageContent(targetBubble, `✅ Đã chuyển sang **${newConfig.name}**!`);
      return true;
    }

    // /add - mở modal thêm task
    if (t === '/add' || t === '/them') {
      if (typeof window.openAddTaskModal === 'function') {
        window.openAddTaskModal();
        setBotMessageContent(targetBubble, 'Đã mở form thêm task bên trên! 📝');
      } else {
        setBotMessageContent(targetBubble, 'Không thể mở form thêm task. Bạn thử reload trang nhé.');
      }
      return true;
    }

    // /logout
    if (t === '/logout' || t === '/dangxuat') {
      const ok = await botConfirm('Đăng xuất', 'Bạn có chắc muốn đăng xuất không?', 'Đăng xuất', 'Huỷ');
      if (!ok) { setBotMessageContent(targetBubble, 'Đã huỷ.'); return true; }
      if (typeof window.clearAuth === 'function') window.clearAuth();
      if (typeof window.loadAll === 'function') await window.loadAll();
      setBotMessageContent(targetBubble, 'Đã đăng xuất. Hẹn gặp lại! 👋');
      return true;
    }

    // "cho task ID tiến độ lên X%" hoặc "/progress ID X"
    const progMatch = t.match(/(?:\/progress|tiến\s*độ\s*(?:lên)?|progress)\s+(?:cho\s+task\s+)?(#?)([a-f0-9]{6,24})\s+(?:lên\s+)?(\d{1,3})\s*%?/i);
    if (progMatch) {
      const shortId = progMatch[2];
      const pct = Math.min(100, Math.max(0, parseInt(progMatch[3])));
      const task = (window._tasks || []).find(tk => tk._id && tk._id.endsWith(shortId));
      if (!task) { setBotMessageContent(targetBubble, `Không tìm thấy task #${shortId}.`); return true; }
      try {
        await updateTask(task._id, { progress: pct });
        if (typeof loadAll === 'function') await loadAll();
        setBotMessageContent(targetBubble, `[OK] Đã cập nhật tiến độ **"${task.name}"** lên ${pct}%.`);
      } catch (err) { setBotMessageContent(targetBubble, `Lỗi: ${err.message}`); }
      return true;
    }

    // /del #abc123 hoặc /del abc123 hoặc "xóa task abc123" hoặc "xoá task abc123"
    const delMatch = t.match(/(?:\/del|x[oó]a\s+task)\s+(#?)([a-f0-9]{6,24})$/i);
    if (delMatch) {
      const shortId = delMatch[2];
      const task = (window._tasks || []).find(tk => tk._id && tk._id.endsWith(shortId));
      if (!task) {
        setBotMessageContent(targetBubble, `Không tìm thấy task với mã #${shortId}.`);
        return true;
      }
      if (!(await botConfirm('Xoá task', `Xoá task "${task.name}"?`, 'Xoá', 'Huỷ'))) {
        setBotMessageContent(targetBubble, 'Đã huỷ xoá.');
        return true;
      }
      try {
        await deleteTask(task._id);
        if (typeof loadAll === 'function') await loadAll();
        setBotMessageContent(targetBubble, `[OK] Đã xoá task **"${task.name}"**.`);
      } catch (err) {
        setBotMessageContent(targetBubble, `Lỗi: ${err.message}`);
      }
      return true;
    }

    // /edit #ID name | reason hoặc "sửa task ID thành name" hoặc "sửa task ID name | reason"
    const editMatch = t.match(/(?:\/edit|sửa\s+task)\s+(#?)([a-f0-9]{6,24})\s+(?:th[àa]nh\s+)?(.+)$/i);
    if (editMatch) {
      const shortId = editMatch[2];
      const rest = editMatch[3];
      const task = (window._tasks || []).find(tk => tk._id && tk._id.endsWith(shortId));
      if (!task) {
        setBotMessageContent(targetBubble, `Không tìm thấy task với mã #${shortId}.`);
        return true;
      }
      const parts = rest.split('|').map(s => s.trim());
      const updates = {};
      if (parts[0]) updates.name = parts[0];
      if (parts[1]) updates.reason = parts[1];
      try {
        await updateTask(task._id, updates);
        if (typeof loadAll === 'function') await loadAll();
        setBotMessageContent(targetBubble, `[OK] Đã sửa task thành **"${updates.name || task.name}"**.`);
      } catch (err) {
        setBotMessageContent(targetBubble, `Lỗi: ${err.message}`);
      }
      return true;
    }

    return false; // Không phải command
  }

  function updateMessageCount() {
    const countEl = document.getElementById('bot-message-count');
    if (countEl) {
      countEl.textContent = `${messageCount}/${maxMessages}`;

      // Đổi màu khi gần đạt giới hạn
      if (messageCount >= maxMessages) {
        countEl.style.background = 'rgba(239, 68, 68, 0.3)';
        countEl.style.color = '#fee2e2';
      } else if (messageCount >= maxMessages - 5) {
        countEl.style.background = 'rgba(251, 191, 36, 0.3)';
        countEl.style.color = '#fef3c7';
      } else {
        countEl.style.background = 'rgba(255, 255, 255, 0.15)';
        countEl.style.color = 'inherit';
      }
    }
  }

  function resetChat() {
    messages.innerHTML = '';
    chatHistory = [];
    pendingAction = null;
    messageCount = 0;
    updateMessageCount();
    const msg = appendMessage('bot', welcome);
    // Hiện gợi ý nhanh sau welcome
    if (msg) renderQuickSuggestions(msg.container);
    confirmModal.style.display = 'none';
  }

  function setupInputResize() {
    if (!input || !resizeHandle) return;
    let startY = 0, startHeight = 0;

    function onMove(event) {
      const pointerY = event.touches?.[0]?.clientY ?? event.clientY;
      input.style.height = Math.max(40, Math.min(180, startHeight + startY - pointerY)) + 'px';
    }
    function onEnd() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }
    function onStart(event) {
      startY = event.touches?.[0]?.clientY ?? event.clientY;
      startHeight = input.getBoundingClientRect().height;
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ns-resize';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onEnd);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onEnd);
      event.preventDefault();
    }
    resizeHandle.addEventListener('mousedown', onStart);
    resizeHandle.addEventListener('touchstart', onStart, { passive: false });
  }

  function setupChatResize() {
    const windowEl = document.getElementById('bot-chat-window');
    if (!windowEl) return;

    // Kéo trái (ngang)
    const handleLeft = document.getElementById('bot-resize-handle');
    if (handleLeft) {
      let startX = 0, startWidth = 0;
      const onMoveX = (event) => {
        const px = event.touches?.[0]?.clientX ?? event.clientX;
        windowEl.style.width = Math.max(300, Math.min(800, startWidth + startX - px)) + 'px';
      };
      const onEndX = () => {
        document.removeEventListener('mousemove', onMoveX);
        document.removeEventListener('mouseup', onEndX);
        document.removeEventListener('touchmove', onMoveX);
        document.removeEventListener('touchend', onEndX);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        handleLeft.classList.remove('resizing');
      };
      handleLeft.addEventListener('mousedown', (event) => {
        startX = event.clientX;
        startWidth = windowEl.getBoundingClientRect().width;
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'ew-resize';
        handleLeft.classList.add('resizing');
        document.addEventListener('mousemove', onMoveX);
        document.addEventListener('mouseup', onEndX);
        event.preventDefault();
      });
      handleLeft.addEventListener('touchstart', (event) => {
        startX = event.touches[0].clientX;
        startWidth = windowEl.getBoundingClientRect().width;
        document.body.style.userSelect = 'none';
        handleLeft.classList.add('resizing');
        document.addEventListener('touchmove', onMoveX, { passive: false });
        document.addEventListener('touchend', onEndX);
      }, { passive: false });
    }

    // Kéo dưới (dọc)
    const handleBottom = document.getElementById('bot-resize-handle-bottom');
    if (handleBottom) {
      let startY = 0, startHeight = 0;
      const onMoveY = (event) => {
        const py = event.touches?.[0]?.clientY ?? event.clientY;
        windowEl.style.height = Math.max(350, Math.min(800, startHeight + py - startY)) + 'px';
      };
      const onEndY = () => {
        document.removeEventListener('mousemove', onMoveY);
        document.removeEventListener('mouseup', onEndY);
        document.removeEventListener('touchmove', onMoveY);
        document.removeEventListener('touchend', onEndY);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        handleBottom.classList.remove('resizing');
      };
      handleBottom.addEventListener('mousedown', (event) => {
        startY = event.clientY;
        startHeight = windowEl.getBoundingClientRect().height;
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'ns-resize';
        handleBottom.classList.add('resizing');
        document.addEventListener('mousemove', onMoveY);
        document.addEventListener('mouseup', onEndY);
        event.preventDefault();
      });
      handleBottom.addEventListener('touchstart', (event) => {
        startY = event.touches[0].clientY;
        startHeight = windowEl.getBoundingClientRect().height;
        document.body.style.userSelect = 'none';
        handleBottom.classList.add('resizing');
        document.addEventListener('touchmove', onMoveY, { passive: false });
        document.addEventListener('touchend', onEndY);
      }, { passive: false });
    }
  }

  function setupEyeTracking() {
    if (!fab) return;

    let frameId = 0;

    function resetEyes() {
      wrapper.style.setProperty('--pupil-x', '0px');
      wrapper.style.setProperty('--pupil-y', '0px');
    }

    function onMove(event) {
      if (wrapper.classList.contains('is-open')) return;

      const rect = fab.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const maxOffset = 2.2;

      const dx = event.clientX - centerX;
      const dy = event.clientY - centerY;
      const distance = Math.max(Math.hypot(dx, dy), 1);
      const ratio = Math.min(distance / 80, 1);

      const offsetX = (dx / distance) * maxOffset * ratio;
      const offsetY = (dy / distance) * maxOffset * ratio;

      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        wrapper.style.setProperty('--pupil-x', `${offsetX.toFixed(2)}px`);
        wrapper.style.setProperty('--pupil-y', `${offsetY.toFixed(2)}px`);
      });
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('blur', resetEyes);
    document.addEventListener('mouseleave', resetEyes);
  }

  function setupDraggableWidget() {
    if (!fab) return;

    const storageKey = 'notetasks_chatbot_position';
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let didDrag = false;
    let pointerActive = false;
    let lastMoveX = 0;
    let lastMoveY = 0;
    let lastMoveTime = 0;
    let dragStartTime = 0;
    let recentVx = 0;
    let recentVy = 0;

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }

    function applyPosition(left, top) {
      const rect = fab.getBoundingClientRect();
      const nextLeft = clamp(left, 8, window.innerWidth - rect.width - 8);
      const nextTop = clamp(top, 8, window.innerHeight - rect.height - 8);

      fab.style.left = `${nextLeft}px`;
      fab.style.top = `${nextTop}px`;
      fab.style.right = 'auto';
      fab.style.bottom = 'auto';
      wrapper.style.setProperty('--bot-fab-left', `${nextLeft}px`);
      wrapper.style.setProperty('--bot-fab-top', `${nextTop}px`);
      wrapper.style.setProperty('--bot-fab-width', `${rect.width}px`);
      wrapper.style.setProperty('--bot-fab-height', `${rect.height}px`);
      wrapper.classList.add('is-positioned');
    }

    function savePosition() {
      const rect = fab.getBoundingClientRect();
      localStorage.setItem(storageKey, JSON.stringify({ left: rect.left, top: rect.top }));
    }

    function startBounce(vx, vy) {
      if (bounceAnimId) cancelAnimationFrame(bounceAnimId);

      // Tắt transition + CSS animation (ufoFloat/ufoHover) để rotation 3D không bị ghi đè
      fab.style.transition = 'none';
      fab.style.animation = 'none';
      fab.classList.add('is-bouncing');

      const rect = fab.getBoundingClientRect();
      let x = rect.left;
      let y = rect.top;
      const w = rect.width;
      const h = rect.height;
      const friction = 0.985;
      const bounceDamping = 0.75;
      let rotation = 0;
      let rotSpeed = (vx + vy) * 3;
      const minVel = 0.3;

      function animate() {
        // Cập nhật vị trí
        x += vx;
        y += vy;

        // Dội tường trái/phải
        if (x <= 4) { x = 4; vx = Math.abs(vx) * bounceDamping; rotSpeed = -rotSpeed * 0.8; }
        if (x + w >= window.innerWidth - 4) { x = window.innerWidth - w - 4; vx = -Math.abs(vx) * bounceDamping; rotSpeed = -rotSpeed * 0.8; }

        // Dội tường trên/dưới
        if (y <= 4) { y = 4; vy = Math.abs(vy) * bounceDamping; rotSpeed = -rotSpeed * 0.8; }
        if (y + h >= window.innerHeight - 4) { y = window.innerHeight - h - 4; vy = -Math.abs(vy) * bounceDamping; rotSpeed = -rotSpeed * 0.8; }

        // Ma sát
        vx *= friction;
        vy *= friction;
        rotSpeed *= friction;

        // Xoay lộn nhào 2D (chỉ rotateZ)
        rotation += rotSpeed;

        // Áp dụng vị trí + xoay 2D
        fab.style.left = `${x}px`;
        fab.style.top = `${y}px`;
        fab.style.transform = `rotate(${rotation}deg)`;
        wrapper.style.setProperty('--bot-fab-left', `${x}px`);
        wrapper.style.setProperty('--bot-fab-top', `${y}px`);
        wrapper.classList.add('is-positioned');

        // Lảo đảo khi sắp dừng
        const speed = Math.hypot(vx, vy);
        if (speed < 3 && !fab.classList.contains('dizzy')) {
          fab.classList.add('dizzy');
        } else if (speed >= 3 && fab.classList.contains('dizzy')) {
          fab.classList.remove('dizzy');
        }

        // Dừng khi đủ chậm
        if (speed < minVel && Math.abs(rotSpeed) < 0.5) {
          fab.style.transform = '';
          fab.style.transition = '';
          fab.style.animation = '';
          fab.classList.remove('dizzy');
          fab.classList.remove('is-bouncing');
          savePosition();
          bounceAnimId = null;
          return;
        }

        bounceAnimId = requestAnimationFrame(animate);
      }

      bounceAnimId = requestAnimationFrame(animate);
    }

    function restorePosition() {
      try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!Number.isFinite(parsed.left) || !Number.isFinite(parsed.top)) return;
        requestAnimationFrame(() => applyPosition(parsed.left, parsed.top));
      } catch (e) { /* bỏ qua */ }
    }

    function onPointerDown(event) {
      if (event.button !== undefined && event.button !== 0) return;

      // Dừng bounce nếu đang bay
      if (bounceAnimId) { cancelAnimationFrame(bounceAnimId); bounceAnimId = null; fab.style.transform = ''; fab.style.transition = ''; fab.style.animation = ''; fab.classList.remove('dizzy'); fab.classList.remove('is-bouncing'); }

      const rect = fab.getBoundingClientRect();
      startX = event.clientX;
      startY = event.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      didDrag = false;
      pointerActive = true;
      lastMoveX = event.clientX;
      lastMoveY = event.clientY;
      lastMoveTime = Date.now();
      dragStartTime = Date.now();
      recentVx = 0;
      recentVy = 0;

      try { fab.setPointerCapture?.(event.pointerId); } catch(e) {}
      fab.style.cursor = 'grabbing';
    }

    function onPointerMove(event) {
      if (!pointerActive) return;

      const dx = event.clientX - startX;
      const dy = event.clientY - startY;

      // Tính vận tốc tức thời (px/ms) dựa trên chuyển động gần nhất
      const now = Date.now();
      const dt = now - lastMoveTime;
      if (dt > 0) {
        // Smoothing nhẹ để không giật khi pointer rung
        recentVx = recentVx * 0.4 + ((event.clientX - lastMoveX) / dt) * 0.6;
        recentVy = recentVy * 0.4 + ((event.clientY - lastMoveY) / dt) * 0.6;
      }
      lastMoveX = event.clientX;
      lastMoveY = event.clientY;
      lastMoveTime = now;

      if (Math.hypot(dx, dy) < 4 && !didDrag) return;

      didDrag = true;
      applyPosition(startLeft + dx, startTop + dy);
      event.preventDefault();
    }

    function onPointerUp(event) {
      if (didDrag) {
        suppressNextFabClick = true;
        savePosition();
        setTimeout(() => { suppressNextFabClick = false; }, 0);

        // Chỉ ném khi user vung tay thực sự:
        //   1. Pointer vẫn đang di chuyển ngay lúc thả (last move < 100ms ago)
        //   2. Vận tốc tức thời đủ lớn (không phải kéo chậm thả)
        const timeSinceLastMove = Date.now() - lastMoveTime;
        const speedBoost = 40;
        const vx = recentVx * speedBoost;
        const vy = recentVy * speedBoost;
        const throwSpeed = Math.hypot(vx, vy);
        const MIN_THROW_SPEED = 14;

        if (timeSinceLastMove < 100 && throwSpeed > MIN_THROW_SPEED) {
          startBounce(vx, vy);
        }
      }

      startX = 0;
      startY = 0;
      pointerActive = false;
      fab.style.cursor = '';
      try { fab.releasePointerCapture?.(event.pointerId); } catch(e) {}
    }

    function onResize() {
      const rect = fab.getBoundingClientRect();
      if (fab.style.left && fab.style.top) {
        applyPosition(rect.left, rect.top);
        savePosition();
      }
    }

    // ===== Bay đến vị trí chuột khi double-click =====
    let flyAnimId = null;

    function flyTo(targetLeft, targetTop) {
      // Huỷ bounce/fly cũ nếu đang chạy
      if (bounceAnimId) { cancelAnimationFrame(bounceAnimId); bounceAnimId = null; fab.classList.remove('dizzy'); fab.classList.remove('is-bouncing'); }
      if (flyAnimId) { cancelAnimationFrame(flyAnimId); flyAnimId = null; }

      fab.style.transition = 'none';
      fab.style.animation = 'none';
      fab.style.transform = '';
      fab.classList.add('is-flying');

      const rect = fab.getBoundingClientRect();
      const startLeft = rect.left;
      const startTop = rect.top;
      const dx = targetLeft - startLeft;
      const dy = targetTop - startTop;
      const distance = Math.hypot(dx, dy);
      if (distance < 2) { fab.classList.remove('is-flying'); fab.style.animation = ''; return; }

      const duration = Math.min(900, Math.max(280, distance * 1.4));
      const startTime = performance.now();
      const ease = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      function step(now) {
        const progress = Math.min(1, (now - startTime) / duration);
        const eased = ease(progress);
        applyPosition(startLeft + dx * eased, startTop + dy * eased);

        if (progress < 1) {
          flyAnimId = requestAnimationFrame(step);
        } else {
          fab.classList.remove('is-flying');
          fab.style.animation = '';
          savePosition();
          flyAnimId = null;
        }
      }
      flyAnimId = requestAnimationFrame(step);
    }

    function onDoubleClick(event) {
      // Bỏ qua nếu double-click trên chính bot hoặc chat window
      if (fab.contains(event.target)) return;
      const chatWindow = document.getElementById('bot-chat-window');
      if (chatWindow && chatWindow.contains(event.target)) return;

      const rect = fab.getBoundingClientRect();
      const targetLeft = event.clientX - rect.width / 2;
      const targetTop = event.clientY - rect.height / 2;
      flyTo(targetLeft, targetTop);
    }

    restorePosition();
    fab.addEventListener('pointerdown', onPointerDown);
    fab.addEventListener('pointermove', onPointerMove);
    fab.addEventListener('pointerup', onPointerUp);
    fab.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('resize', onResize);
    document.addEventListener('dblclick', onDoubleClick);
  }

  // ===== Event Listeners =====
  fab?.addEventListener('click', () => {
    if (suppressNextFabClick) return;
    // Dừng bounce nếu đang bay
    if (bounceAnimId) { cancelAnimationFrame(bounceAnimId); bounceAnimId = null; fab.style.transform = ''; fab.style.transition = ''; fab.style.animation = ''; fab.classList.remove('dizzy'); fab.classList.remove('is-bouncing'); }
    setOpen(!wrapper.classList.contains('is-open'));
  });
  sendBtn?.addEventListener('click', () => {
    if (isSending && abortController) {
      abortController.abort();
    } else {
      sendMessage();
    }
  });
  uploadBtn?.addEventListener('click', (e) => { e.preventDefault(); showToast('Chức năng đang phát triển.'); });
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  wrapper.querySelectorAll('.theme-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      const color = dot.getAttribute('data-color');
      if (!color) return;

      const matchedTheme = Object.entries(chatbotThemes).find(([, theme]) => theme.primary === color);
      if (matchedTheme) {
        currentThemeKey = matchedTheme[0];
        // Lưu theme vào localStorage
        localStorage.setItem('chatbot-theme', currentThemeKey);
      }
      const theme = chatbotThemes[currentThemeKey] || chatbotThemes.blue;

      wrapper.style.setProperty('--bot-primary', theme.primary);
      wrapper.style.setProperty('--bot-secondary', theme.secondary);
      if (statusText) statusText.textContent = theme.persona;
    });
  });

  newChatBtn?.addEventListener('click', () => {
    // Cập nhật text modal dựa trên context
    const modalTitle = confirmModal.querySelector('h4');
    const modalText = confirmModal.querySelector('p');

    if (messageCount >= maxMessages) {
      modalTitle.textContent = 'Đã đạt giới hạn 20 câu hỏi!';
      modalText.textContent = 'Bạn muốn tạo cuộc hội thoại mới không? Lịch sử chat hiện tại sẽ bị xóa.';
    } else {
      modalTitle.textContent = 'Cuộc hội thoại mới?';
      modalText.textContent = 'Hành động này sẽ xóa lịch sử chat hiện tại.';
    }

    confirmModal.style.display = 'flex';
  });
  confirmYes?.addEventListener('click', resetChat);
  confirmNo?.addEventListener('click', () => { confirmModal.style.display = 'none'; });
  document.getElementById('bot-close-chat')?.addEventListener('click', () => setOpen(false));
  document.getElementById('bot-reset-size')?.addEventListener('click', () => {
    const w = document.getElementById('bot-chat-window');
    if (w) { w.style.width = ''; w.style.height = ''; }
  });
  document.getElementById('bot-reset-limit-btn')?.addEventListener('click', resetChat);
  document.getElementById('bot-feedback-close')?.addEventListener('click', () => {
    document.getElementById('bot-feedback-modal').style.display = 'none';
  });
  document.getElementById('bot-feedback-retry')?.addEventListener('click', () => {
    document.getElementById('bot-feedback-modal').style.display = 'none';
    input?.focus();
  });

  // Pre-load config từ server .env
  loadConfig();

  // Load saved model từ localStorage
  const savedModel = localStorage.getItem('chatbot-model');
  if (savedModel && modelConfigs[savedModel]) {
    currentModelType = savedModel;
  }

  // Tin nhắn gợi ý ngắn, xoay vòng
  const bubbleMessages = [
    '/add để thêm task nha! 🚀',
    'Gõ /help để xem hướng dẫn',
    'Hỏi mình bất cứ điều gì!',
    'Cần thống kê? Cứ hỏi nè',
    '/edit #mã để sửa task',
  ];
  let bubbleIndex = 0;

  function showNextBubble() {
    if (wrapper.classList.contains('is-open')) {
      setTimeout(showNextBubble, 8000);
      return;
    }
    showBubble(bubbleMessages[bubbleIndex], 5000);
    bubbleIndex = (bubbleIndex + 1) % bubbleMessages.length;
    setTimeout(showNextBubble, 8000);
  }
  setTimeout(showNextBubble, 3000);

  // Reset chat để hiện welcome + gợi ý
  setStatus('online');
  resetChat();

  // Apply saved theme
  const theme = chatbotThemes[currentThemeKey] || chatbotThemes.blue;
  wrapper.style.setProperty('--bot-primary', theme.primary);
  wrapper.style.setProperty('--bot-secondary', theme.secondary);
  if (statusText) statusText.textContent = theme.persona;

  setupInputResize();
  setupChatResize();
  setupEyeTracking();
  setupDraggableWidget();
  setupIdleTumble();
  playWelcomeEyes();

  // Welcome eyes khi load trang: liếc trái → phải → xuống → blink → về giữa
  function playWelcomeEyes() {
    if (!fab) return;
    fab.classList.add('is-welcoming');

    // Pupil maxOffset trùng với setupEyeTracking (2.2px)
    const sequence = [
      { x: -2.2, y: 0, delay: 350 },    // liếc trái
      { x: 2.2, y: 0, delay: 600 },     // liếc phải
      { x: 2.2, y: 1.5, delay: 500 },   // nhìn xuống-phải
      { x: -2.2, y: 1.5, delay: 500 },  // nhìn xuống-trái
      { x: 0, y: -1.5, delay: 500 },    // ngước lên
      { x: 0, y: 0, delay: 400 },       // về giữa
    ];

    let t = 200; // chờ chút sau khi mount
    sequence.forEach((step, i) => {
      setTimeout(() => {
        wrapper.style.setProperty('--pupil-x', `${step.x}px`);
        wrapper.style.setProperty('--pupil-y', `${step.y}px`);
        // Blink nhanh tại bước thứ 3 (nhìn xuống) và bước cuối
        if (i === 2 || i === sequence.length - 1) {
          fab.querySelectorAll('.eye').forEach(eye => {
            eye.style.animation = 'welcomeBlink 0.3s ease-in-out';
            setTimeout(() => { eye.style.animation = ''; }, 320);
          });
        }
      }, t);
      t += step.delay;
    });

    // Kết thúc: gỡ class để eye-tracking thường tiếp quản
    setTimeout(() => {
      fab.classList.remove('is-welcoming');
    }, t + 100);
  }

  // Tự lộn nhào tại chỗ sau ngẫu nhiên 2-5s
  function setupIdleTumble() {
    if (!fab) return;
    const busyClasses = ['popup-open', 'is-bouncing', 'is-flying', 'sleeping', 'dizzy'];
    const isBusy = () => busyClasses.some(c => fab.classList.contains(c));

    function tumbleOnce() {
      if (isBusy()) return;
      fab.style.animation = 'idleTumble 0.55s linear';
      setTimeout(() => {
        if (fab.style.animation && fab.style.animation.includes('idleTumble')) {
          fab.style.animation = '';
        }
      }, 570);
    }

    function scheduleNext() {
      const delay = 15000 + Math.random() * 45000; // 15-60s
      setTimeout(() => {
        tumbleOnce();
        scheduleNext();
      }, delay);
    }
    scheduleNext();
  }

  // ===== Auth Integration =====
  window.updateChatbotAuth = function(user, token) {
    botCurrentUser = user;
    botAuthToken = token;
  };

  // Handle /login command
  async function handleLoginCommand() {
    if (botCurrentUser) {
      return `Bạn đã đăng nhập rồi (${botCurrentUser.username}). Gõ /logout để đăng xuất.`;
    }

    if (typeof window.showLoginModal === 'function') {
      window.showLoginModal();
      return 'Đang mở form đăng nhập...';
    }

    return 'Không thể mở form đăng nhập. Vui lòng thử lại.';
  }

  // Intercept messages for /login command
  const originalSendMessage = sendMessage;
  sendMessage = async function() {
    const text = input?.value?.trim();
    if (!text) return;

    if (text === '/login') {
      input.value = '';
      appendMessage('user', '/login');
      const botMsg = createStreamingBotMessage();
      const response = await handleLoginCommand();
      setBotMessageContent(botMsg.bubble, response);
      return;
    }

    originalSendMessage();
  };
})();
