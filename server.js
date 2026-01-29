// 1. IMPORT (The tools)
const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require('axios');

// 2. ENVIRONMENT VARIABLES - Validate before using
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Validate environment variables (with helpful warnings)
if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn('⚠️  WARNING: Missing SUPABASE_URL or SUPABASE_KEY');
    console.warn('📝 Server will start but database operations will fail');
    console.warn('💡 Set environment variables in Render dashboard');
}

if (!GEMINI_API_KEY) {
    console.warn('⚠️  WARNING: Missing GEMINI_API_KEY');
    console.warn('📝 AI chat will not work without this key');
    console.warn('💡 Get your key from: https://aistudio.google.com/app/apikey');
}

// Initialize Supabase client (will be null if env vars missing)
const supabase = SUPABASE_URL && SUPABASE_KEY 
    ? createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

// Initialize Gemini AI (will be null if API key missing)
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

// 3. INITIALIZE (The "app")
const app = express();
const httpServer = createServer(app);

// 4. CONFIGURE (The settings)
app.use(cors({ 
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

// 5. ROUTES

// Health check route
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Server is running',
        services: {
            database: supabase ? 'connected' : 'not configured',
            ai: genAI ? 'configured' : 'not configured'
        }
    });
});

// ============================================
// WHATSAPP WEBHOOK ROUTES
// ============================================

// Webhook Verification (Meta requires this)
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log('🔍 Webhook verification attempt');
    console.log('Mode:', mode);
    console.log('Token received:', token);
    console.log('Token expected:', process.env.WHATSAPP_VERIFY_TOKEN);

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
        console.log('✅ WhatsApp Webhook Verified');
        res.status(200).send(challenge);
    } else {
        console.log('❌ Webhook verification failed');
        res.sendStatus(403);
    }
});

// Webhook Message Handler
app.post('/webhook', async (req, res) => {
    try {
        const body = req.body;
        console.log('📨 Incoming webhook POST');

        // Quick 200 response (Meta requires within 20 seconds)
        res.sendStatus(200);

        // Process WhatsApp message
        if (body.object === 'whatsapp_business_account') {
            const entry = body.entry?.[0];
            const changes = entry?.changes?.[0];
            const value = changes?.value;

            if (value?.messages) {
                const message = value.messages[0];
                const from = message.from;
                const messageBody = message.text?.body;
                const messageId = message.id;
                const customerName = value.contacts?.[0]?.profile?.name;

                console.log(`📩 Message from ${from}: ${messageBody}`);

                // Send read receipt
                await sendReadReceipt(messageId);

                // Send typing indicator
                await sendTypingIndicator(from);

                // Process message with AI
                await handleIntelligentMessage(from, messageBody, customerName);
            }
        }
    } catch (error) {
        console.error('❌ Webhook Error:', error);
    }
});

// ============================================
// CHATBOT API ROUTES
// ============================================

// AI Chat endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { message, botId } = req.body;

        // Validate input
        if (!message) {
            return res.status(400).json({ 
                reply: "Message is required" 
            });
        }

        if (!botId) {
            return res.status(400).json({ 
                reply: "Bot ID is required" 
            });
        }

        // Check if services are configured
        if (!supabase) {
            return res.status(503).json({ 
                reply: "Database not configured. Please contact support." 
            });
        }

        if (!genAI) {
            return res.status(503).json({ 
                reply: "AI service not configured. Please contact support." 
            });
        }

        // 1. Get the bot's "Knowledge Base" (Context) from Supabase
        const { data: bot, error } = await supabase
            .from('chatbots')
            .select('context, name, greeting')
            .eq('id', botId)
            .single();

        if (error) {
            console.error('Supabase error:', error);
            return res.status(404).json({ 
                reply: "Bot not found. Please check the bot ID." 
            });
        }

        if (!bot) {
            return res.status(404).json({ 
                reply: "Bot configuration not found." 
            });
        }

        // 2. Prepare the AI model
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash",
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 500,
            }
        });
        
        // 3. Create the prompt (The instructions for the AI)
        const systemPrompt = bot.context || "You are a helpful assistant.";
        const prompt = `You are ${bot.name || 'a helpful assistant'}.

Your knowledge base:
${systemPrompt}

Instructions:
- Answer based ONLY on the knowledge provided above
- Keep responses brief and helpful
- If the question is outside your knowledge, politely say you don't have that information
- Be friendly and professional

User question: ${message}

Your response:`;

        // 4. Generate the response
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        res.json({ 
            reply: text,
            success: true 
        });

    } catch (err) {
        console.error('Chat error:', err);
        
        // Handle specific Gemini API errors
        if (err.message?.includes('API key')) {
            return res.status(500).json({ 
                reply: "AI service configuration error. Please contact support." 
            });
        }
        
        if (err.message?.includes('quota')) {
            return res.status(429).json({ 
                reply: "AI service is temporarily busy. Please try again in a moment." 
            });
        }

        res.status(500).json({ 
            reply: "I'm having trouble processing your message. Please try again." 
        });
    }
});

// Route to save a new bot from your Maker UI
app.post('/api/create-bot', async (req, res) => {
    try {
        // Check if Supabase is configured
        if (!supabase) {
            return res.status(503).json({ 
                success: false, 
                error: 'Database not configured. Please set SUPABASE_URL and SUPABASE_KEY.' 
            });
        }

        const { name, greeting, context } = req.body;
        
        // Validate input
        if (!name || !greeting) {
            return res.status(400).json({ 
                success: false, 
                error: 'Name and greeting are required' 
            });
        }

        const { data, error } = await supabase
            .from('chatbots')
            .insert([{ 
                name, 
                greeting, 
                context: context || '' 
            }])
            .select();

        if (error) {
            console.error('Supabase error:', error);
            return res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }

        if (!data || data.length === 0) {
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to create bot' 
            });
        }

        res.status(200).json({ 
            success: true, 
            id: data[0].id,
            bot: data[0]
        });
    } catch (err) {
        console.error('Server error:', err);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

// Route for the widget to load bot settings
app.get('/api/get-bot', async (req, res) => {
    try {
        // Check if Supabase is configured
        if (!supabase) {
            return res.status(503).json({ 
                error: 'Database not configured. Please set SUPABASE_URL and SUPABASE_KEY.' 
            });
        }

        const { id } = req.query;

        // Validate input
        if (!id) {
            return res.status(400).json({ 
                error: 'Bot ID is required' 
            });
        }

        const { data, error } = await supabase
            .from('chatbots')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            console.error('Supabase error:', error);
            return res.status(404).json({ 
                error: 'Bot not found' 
            });
        }

        res.json(data);
    } catch (err) {
        console.error('Server error:', err);
        res.status(500).json({ 
            error: 'Internal server error' 
        });
    }
});

// Route to get all bots (useful for listing in maker UI)
app.get('/api/list-bots', async (req, res) => {
    try {
        // Check if Supabase is configured
        if (!supabase) {
            return res.status(503).json({ 
                success: false, 
                error: 'Database not configured. Please set SUPABASE_URL and SUPABASE_KEY.' 
            });
        }

        const { data, error } = await supabase
            .from('chatbots')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Supabase error:', error);
            return res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }

        res.json({ 
            success: true, 
            bots: data 
        });
    } catch (err) {
        console.error('Server error:', err);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

// Route to update a bot
app.put('/api/update-bot/:id', async (req, res) => {
    try {
        // Check if Supabase is configured
        if (!supabase) {
            return res.status(503).json({ 
                success: false, 
                error: 'Database not configured. Please set SUPABASE_URL and SUPABASE_KEY.' 
            });
        }

        const { id } = req.params;
        const { name, greeting, context } = req.body;

        const { data, error } = await supabase
            .from('chatbots')
            .update({ name, greeting, context })
            .eq('id', id)
            .select();

        if (error) {
            console.error('Supabase error:', error);
            return res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }

        if (!data || data.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Bot not found' 
            });
        }

        res.json({ 
            success: true, 
            bot: data[0] 
        });
    } catch (err) {
        console.error('Server error:', err);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

// Route to delete a bot
app.delete('/api/delete-bot/:id', async (req, res) => {
    try {
        // Check if Supabase is configured
        if (!supabase) {
            return res.status(503).json({ 
                success: false, 
                error: 'Database not configured. Please set SUPABASE_URL and SUPABASE_KEY.' 
            });
        }

        const { id } = req.params;

        const { error } = await supabase
            .from('chatbots')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Supabase error:', error);
            return res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }

        res.json({ 
            success: true, 
            message: 'Bot deleted successfully' 
        });
    } catch (err) {
        console.error('Server error:', err);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

// 404 handler for undefined routes
app.use((req, res) => {
    res.status(404).json({ 
        error: 'Route not found',
        path: req.path
    });
});

// ============================================
// WHATSAPP HELPER FUNCTIONS
// ============================================

// Send Read Receipt
async function sendReadReceipt(messageId) {
    try {
        await axios.post(
            `https://graph.facebook.com/v24.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: 'whatsapp',
                status: 'read',
                message_id: messageId
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
    } catch (error) {
        console.error('Read receipt error:', error.response?.data);
    }
}

// Send Typing Indicator (natural WhatsApp typing animation)
async function sendTypingIndicator(phoneNumber, durationMs = 2000) {
    // WhatsApp shows "typing..." automatically during response delay
    // Just add a human-like pause
    await new Promise(resolve => setTimeout(resolve, durationMs));
}

// Main Message Handler
// Main Message Handler
async function handleIntelligentMessage(phoneNumber, message, customerName) {
    try {
        // Get or create customer
        let customer = await getOrCreateCustomer(phoneNumber, customerName);

        // Save incoming message
        await saveConversation(customer.id, phoneNumber, 'incoming', message);

        // Get conversation history
        const conversationHistory = await getConversationHistory(phoneNumber, 5);

        // Check if order-related
        const isOrderIntent = detectOrderIntent(message);

        let aiResponse;

        if (isOrderIntent) {
            // Show typing indicator before generating response
            await sendTypingIndicator(phoneNumber);
            
            // Generate personalized order response
            aiResponse = await generateOrderResponse(customer, conversationHistory);
            await sendTextMessage(phoneNumber, aiResponse);

            // Wait then send order button
            await new Promise(resolve => setTimeout(resolve, 1000));
            await sendOrderButton(phoneNumber, customer.customer_name || 'friend');

            // Track order attempt
            await createOrderRecord(customer.id, phoneNumber);

        } else {
            // Show typing indicator before generating response
            await sendTypingIndicator(phoneNumber);
            
            // General AI response
            aiResponse = await generateSmartResponse(message, conversationHistory, customer);
            await sendTextMessage(phoneNumber, aiResponse);
        }

        // Save AI response
        await saveConversation(customer.id, phoneNumber, 'outgoing', aiResponse);

    } catch (error) {
        console.error('❌ Message handling error:', error);
        await sendTextMessage(phoneNumber, "Sorry, I having some trouble right now. Give me a second!");
    }
}

// Database: Get or Create Customer
async function getOrCreateCustomer(phoneNumber, name) {
    let { data: customer } = await supabase
        .from('whatsapp_customers')
        .select('*')
        .eq('phone_number', phoneNumber)
        .single();

    if (customer) {
        await supabase
            .from('whatsapp_customers')
            .update({
                last_interaction: new Date().toISOString(),
                total_interactions: customer.total_interactions + 1,
                customer_name: name || customer.customer_name
            })
            .eq('phone_number', phoneNumber);

        return { ...customer, customer_name: name || customer.customer_name };
    } else {
        const { data: newCustomer } = await supabase
            .from('whatsapp_customers')
            .insert([{
                phone_number: phoneNumber,
                customer_name: name,
                total_interactions: 1
            }])
            .select()
            .single();

        return newCustomer;
    }
}

// Database: Save Conversation
async function saveConversation(customerId, phoneNumber, type, content) {
    await supabase
        .from('whatsapp_conversations')
        .insert([{
            customer_id: customerId,
            phone_number: phoneNumber,
            message_type: type,
            message_content: content
        }]);
}

// Database: Get Conversation History
async function getConversationHistory(phoneNumber, limit = 5) {
    const { data } = await supabase
        .from('whatsapp_conversations')
        .select('message_type, message_content, created_at')
        .eq('phone_number', phoneNumber)
        .order('created_at', { ascending: false })
        .limit(limit);

    return data?.reverse() || [];
}

// Database: Create Order Record
async function createOrderRecord(customerId, phoneNumber) {
    await supabase
        .from('whatsapp_orders')
        .insert([{
            customer_id: customerId,
            phone_number: phoneNumber,
            status: 'pending'
        }]);
}

// AI: Detect Order Intent
function detectOrderIntent(message) {
    const orderKeywords = [
        'order', 'menu', 'food', 'hungry', 'eat', 'delivery',
        'pickup', 'want', 'get', 'buy', 'purchase', 'place'
    ];
    const lowerMessage = message.toLowerCase();
    return orderKeywords.some(keyword => lowerMessage.includes(keyword));
}

// AI: Generate Order Response
async function generateOrderResponse(customer, history) {
    if (!genAI) {
        return "Hey! Ready to order? I'll send you the link.";
    }

    const name = customer.customer_name || 'friend';
    const isReturning = customer.total_interactions > 1;

    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: `You are a friendly Bajan restaurant assistant for Tap & Serve.

Customer: ${name}
Returning: ${isReturning ? 'Yes' : 'No'}

Tone: Warm Bajan English. Use "How you doing?" or "Nice to hear from you again!"
Task: Customer wants to order. Respond enthusiastically. Keep under 2 sentences.`
    });

    const historyContext = history.map(h => `${h.message_type}: ${h.message_content}`).join('\n');
    const prompt = `Recent conversation:\n${historyContext}\n\nRespond warmly about their order intent.`;

    const result = await model.generateContent(prompt);
    return result.response.text();
}

// AI: Generate Smart Response
async function generateSmartResponse(message, history, customer) {
    if (!genAI) {
        return "Thanks for your message! How can I help you today?";
    }

    const name = customer.customer_name || 'friend';

    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: `You are a helpful Bajan assistant for Tap & Serve restaurant ordering system.

Customer: ${name}

Your role:
- Answer questions about ordering, menu, delivery
- Be warm and conversational (Bajan style)
- If ready to order, suggest: "Want me to send you the order link?"
- Keep responses under 3 sentences

Style: Friendly Bajan English. Natural, not robotic.`
    });

    const historyContext = history.slice(-3).map(h => 
        `${h.message_type === 'incoming' ? 'Customer' : 'You'}: ${h.message_content}`
    ).join('\n');

    const prompt = `Conversation:\n${historyContext}\n\nCustomer: ${message}\n\nYour response:`;

    const result = await model.generateContent(prompt);
    return result.response.text();
}

// WhatsApp: Send Text Message
async function sendTextMessage(phoneNumber, text) {
    try {
        await axios.post(
            `https://graph.facebook.com/v24.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: phoneNumber,
                type: 'text',
                text: { body: text }
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log(`✓ Sent: ${text.substring(0, 50)}...`);
    } catch (error) {
        console.error('Send message error:', error.response?.data);
    }
}

// WhatsApp: Send Order Button (opens in WhatsApp browser)
async function sendOrderButton(phoneNumber, customerName) {
    const orderUrl = `https://tapserve.onrender.com/premium-orders.html?wa_number=${phoneNumber}`;

    try {
        await axios.post(
            `https://graph.facebook.com/v24.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: phoneNumber,
                type: 'interactive',
                interactive: {
                    type: 'cta_url',
                    body: {
                        text: `Alright ${customerName}, ready when you are! 🍽️`
                    },
                    action: {
                        name: 'cta_url',
                        parameters: {
                            display_text: 'Place Order',
                            url: orderUrl
                        }
                    }
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('✓ Sent order button');

    } catch (error) {
        console.error('Button send error:', error.response?.data);
        
        // If button fails, send simple fallback
        await sendTextMessage(phoneNumber, `Sorry ${customerName}, having trouble with the order button. Try again in a moment!`);
    }
}

// 6. START SERVER
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // CRITICAL for Render/Railway/Heroku

httpServer.listen(PORT, HOST, () => {
    console.log(`✅ Server running on ${HOST}:${PORT}`);
    console.log(`📍 Health check: http://localhost:${PORT}/health`);
    console.log(`📞 WhatsApp webhook: http://localhost:${PORT}/webhook`);
    console.log(`🤖 API Base URL: http://localhost:${PORT}/api`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📊 Services:`);
    console.log(`   - Database: ${supabase ? '✅ Connected' : '❌ Not configured'}`);
    console.log(`   - AI: ${genAI ? '✅ Configured' : '❌ Not configured'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    httpServer.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
