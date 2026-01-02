const cors = require('cors');
app.use(cors({ origin: '*' })); // This allows your widget to work on any website

// Route to save a new bot from your Maker UI
app.post('/api/create-bot', async (req, res) => {
    const { name, greeting, context } = req.body;
    const { data, error } = await _supabase.from('chatbots').insert([{ name, greeting, context }]).select();
    if (error) return res.status(500).json({ success: false, error: error.message });
    res.status(200).json({ success: true, id: data[0].id });
});

// Route for the widget to load bot settings
app.get('/api/get-bot', async (req, res) => {
    const { id } = req.query;
    const { data, error } = await _supabase.from('chatbots').select('*').eq('id', id).single();
    if (error) return res.status(404).json({ error: "Bot not found" });
    res.json(data);
});