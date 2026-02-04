(function() {
    // 1. EXTRACT DATA FROM SCRIPT TAG
    const scriptTag = document.currentScript;
    const botId = scriptTag.getAttribute('data-bot-id');
    
    // 🔧 REPLACE THIS WITH YOUR RENDER URL
    const BASE_URL = 'https://bot-8yai.onrender.com';
    // Example: 'https://chatbot-api-abc123.onrender.com'
    
    // 2. INJECT CSS STYLES
    const style = document.createElement('style');
    style.innerHTML = `
        #bot-container { 
            position: fixed; 
            bottom: 20px; 
            right: 20px; 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            z-index: 9999; 
        }
        #bot-bubble { 
            width: 60px; 
            height: 60px; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 50%; 
            cursor: pointer; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            box-shadow: 0 4px 15px rgba(0,0,0,0.3); 
            transition: all 0.3s ease;
            font-size: 28px;
        }
        #bot-bubble:hover { 
            transform: scale(1.1); 
            box-shadow: 0 6px 20px rgba(0,0,0,0.4);
        }
        #bot-window { 
            width: 350px; 
            height: 500px; 
            background: white; 
            border-radius: 16px; 
            display: none; 
            flex-direction: column; 
            box-shadow: 0 10px 40px rgba(0,0,0,0.2); 
            overflow: hidden; 
            margin-bottom: 10px;
            animation: slideUp 0.3s ease;
            transition: all 0.3s ease-in-out; 
        }

        @keyframes slideUp {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
        #bot-header { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white; 
            padding: 18px; 
            font-weight: 600; 
            display: flex; 
            justify-content: space-between; 
            align-items: center;
            font-size: 16px;
        }
        #close-bot {
            cursor: pointer;
            font-size: 24px;
            line-height: 1;
            opacity: 0.9;
            transition: opacity 0.2s;
        }
        #close-bot:hover {
            opacity: 1;
        }
        #bot-messages { 
            flex: 1; 
            padding: 15px; 
            overflow-y: auto; 
            display: flex; 
            flex-direction: column; 
            gap: 12px; 
            background: #f5f5f7;
        }
        #bot-messages::-webkit-scrollbar {
            width: 6px;
        }
        #bot-messages::-webkit-scrollbar-thumb {
            background: #ccc;
            border-radius: 3px;
        }
        #bot-input-area { 
            border-top: 1px solid #e5e5e7; 
            padding: 12px; 
            display: flex; 
            gap: 8px;
            background: white;
        }
        #bot-input { 
            flex: 1; 
            border: 1px solid #ddd; 
            padding: 10px 12px; 
            border-radius: 20px; 
            outline: none;
            font-size: 14px;
            transition: border-color 0.2s;
        }
        #bot-input:focus {
            border-color: #667eea;
        }
        #bot-send-btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 10px 18px;
            border-radius: 20px;
            cursor: pointer;
            font-weight: 600;
            transition: transform 0.2s;
            font-size: 14px;
        }
        #bot-send-btn:hover {
            transform: scale(1.05);
        }
        #bot-send-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .msg { 
            padding: 10px 14px; 
            border-radius: 16px; 
            max-width: 80%; 
            font-size: 14px; 
            line-height: 1.5;
            word-wrap: break-word;
            animation: fadeIn 0.3s ease;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .user-msg { 
            align-self: flex-end; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white; 
            border-bottom-right-radius: 4px;
        }
        .bot-msg { 
            align-self: flex-start; 
            background: white;
            color: #333; 
            border-bottom-left-radius: 4px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.05);
        }
        .typing-indicator {
            display: flex;
            gap: 4px;
            padding: 10px 14px;
            background: white;
            border-radius: 16px;
            align-self: flex-start;
            box-shadow: 0 2px 5px rgba(0,0,0,0.05);
        }
        .typing-indicator span {
            width: 8px;
            height: 8px;
            background: #999;
            border-radius: 50%;
            animation: bounce 1.4s infinite ease-in-out;
        }
        .typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
        .typing-indicator span:nth-child(2) { animation-delay: -0.16s; }
        @keyframes bounce {
            0%, 80%, 100% { transform: scale(0); }
            40% { transform: scale(1); }
        }
        .error-msg {
            align-self: flex-start;
            background: #fee;
            color: #c33;
            border: 1px solid #fcc;
        }

        @media (max-width: 600px) {
            #bot-container {
                bottom: 0 !important;
                right: 0 !important;
            }
            #bot-window.fullscreen-active {
                display: flex !important;
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100dvh; /* Dynamic viewport height for mobile keyboards */
                border-radius: 0;
                margin-bottom: 0;
                z-index: 10000;
            }
            #bot-bubble.hidden {
                display: none;
            }
        }

    `;
    document.head.appendChild(style);

    // 3. CREATE UI ELEMENTS
    const container = document.createElement('div');
    container.id = 'bot-container';
    container.innerHTML = `
        <div id="bot-window">
            <div id="bot-header">
                <span id="bot-name">AI Assistant</span>
                 <span id="close-bot" style="padding: 5px 10px;">Done</span>
            </div>
            <div id="bot-messages"></div>
            <div id="bot-input-area">
                <input type="text" id="bot-input" placeholder="Type a message...">
                <button id="bot-send-btn">Send</button>
            </div>
        </div>
        <div id="bot-bubble">💬</div>
    `;
    document.body.appendChild(container);

    const botWindow = document.getElementById('bot-window');
    const botBubble = document.getElementById('bot-bubble');
    const botMessages = document.getElementById('bot-messages');
    const botInput = document.getElementById('bot-input');
    const botNameHeader = document.getElementById('bot-name');
    const sendBtn = document.getElementById('bot-send-btn');

    // 4. LOAD BOT SETTINGS FROM SERVER
    fetch(`${BASE_URL}/api/get-bot?id=${botId}`)
        .then(res => {
            if (!res.ok) throw new Error('Bot not found');
            return res.json();
        })
        .then(data => {
            botNameHeader.innerText = data.name || 'AI Assistant';
            addMessage(data.greeting || "Hello! How can I help you?", 'bot');
        })
        .catch((err) => {
            console.error('Error loading bot:', err);
            addMessage("Hello! I'm ready to help you.", 'bot');
        });

    // 5. HELPER: ADD MESSAGE TO SCREEN
    function addMessage(text, sender, isError = false) {
        const div = document.createElement('div');
        div.className = `msg ${sender}-msg${isError ? ' error-msg' : ''}`;
        div.innerText = text;
        botMessages.appendChild(div);
        botMessages.scrollTop = botMessages.scrollHeight;
    }

    // 6. HELPER: SHOW TYPING INDICATOR
    function showTyping() {
        const typing = document.createElement('div');
        typing.className = 'typing-indicator';
        typing.id = 'typing-indicator';
        typing.innerHTML = '<span></span><span></span><span></span>';
        botMessages.appendChild(typing);
        botMessages.scrollTop = botMessages.scrollHeight;
    }

    function hideTyping() {
        const typing = document.getElementById('typing-indicator');
        if (typing) typing.remove();
    }

    // 7. TOGGLE WINDOW
    // 7. TOGGLE WINDOW (Updated for Fullscreen)
    const toggleBot = () => {
        const isMobile = window.innerWidth <= 600;
        const isOpen = botWindow.style.display === 'flex' || botWindow.classList.contains('fullscreen-active');

        if (!isOpen) {
            // OPENING
            botWindow.style.display = 'flex';
            if (isMobile) {
                botWindow.classList.add('fullscreen-active');
                botBubble.classList.add('hidden');
                document.body.style.overflow = 'hidden'; // Stop background scroll
            }
            setTimeout(() => botInput.focus(), 100);
        } else {
            // CLOSING
            botWindow.style.display = 'none';
            botWindow.classList.remove('fullscreen-active');
            botBubble.classList.remove('hidden');
            document.body.style.overflow = ''; // Restore scroll
        }
    };

    botBubble.onclick = toggleBot;
    document.getElementById('close-bot').onclick = toggleBot;

    
    // 8. HANDLE SENDING MESSAGE
    async function sendMessage() {
        const message = botInput.value.trim();
        if (message === "") return;

        // Add user message
        addMessage(message, 'user');
        botInput.value = "";
        
        // Disable input while processing
        botInput.disabled = true;
        sendBtn.disabled = true;
        
        // Show typing indicator
        showTyping();

        try {
            const response = await fetch(`${BASE_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, botId })
            });

            hideTyping();

            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.reply) {
                addMessage(data.reply, 'bot');
            } else {
                addMessage("I received your message but couldn't generate a response.", 'bot', true);
            }
        } catch (err) {
            hideTyping();
            console.error('Chat error:', err);
            addMessage("Sorry, I'm having trouble connecting. Please try again.", 'bot', true);
        } finally {
            // Re-enable input
            botInput.disabled = false;
            sendBtn.disabled = false;
            botInput.focus();
        }
    }

    // 9. EVENT LISTENERS
    botInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    sendBtn.addEventListener('click', sendMessage);

    // 10. AUTO-FOCUS INPUT WHEN WINDOW OPENS
    botBubble.addEventListener('click', () => {
        setTimeout(() => botInput.focus(), 100);
    });

    console.log('✅ Chatbot widget loaded successfully');
    console.log('🤖 Bot ID:', botId);
    console.log('🌐 API URL:', BASE_URL);
})();
