require('dotenv').config();

const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("✅ Connected to MongoDB"))
    .catch(err => console.log("❌ MongoDB Connection Error:", err));

    const topTracksSchema = new mongoose.Schema({
        userId: String,
        timestamp: { type: Date, default: Date.now },
        tracks: Array
    });
    
    const TopTracks = mongoose.model("TopTracks", topTracksSchema);
    

    


    const express = require('express');
const axios = require('axios');

const app = express();
const PORT = 3000;

let accessToken = null;

// Step 1: Redirect user to Spotify login
app.get('/login', (req, res) => {
    const authUrl = `https://accounts.spotify.com/authorize?client_id=${process.env.SPOTIFY_CLIENT_ID}&response_type=code&redirect_uri=${process.env.SPOTIFY_REDIRECT_URI}&scope=user-top-read`;
    res.redirect(authUrl);
});

// Step 2: Handle Spotify's callback and get an access token
app.get('/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.send("No code provided");

    try {
        const response = await axios.post('https://accounts.spotify.com/api/token', new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
            client_id: process.env.SPOTIFY_CLIENT_ID,
            client_secret: process.env.SPOTIFY_CLIENT_SECRET
        }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

        accessToken = response.data.access_token;
        res.send(`<h2>Access Token Received! ✅</h2><br>
                  <a href="/top-tracks">View Your Top Songs (Last 4 Years)</a>`);
    } catch (error) {
        res.send("Error getting tokens: " + error.message);
    }
});

app.get('/top-tracks', async (req, res) => {
    if (!accessToken) return res.send("No access token. Please <a href='/login'>log in</a> first.");

    try {
        const userIdResponse = await axios.get('https://api.spotify.com/v1/me', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        const userId = userIdResponse.data.id;

        let allTracks = [];
        let trackSet = new Set();
        let offset = 0;
        const limit = 50; // Max songs per request
        const maxSongs = 150; // Adjust this to increase/decrease how many songs you want

        while (allTracks.length < maxSongs) {
            const response = await axios.get(`https://api.spotify.com/v1/me/top/tracks?limit=${limit}&offset=${offset}&time_range=long_term`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });

            if (!response.data.items.length) break; // No more tracks available

            response.data.items.forEach(track => {
                const trackKey = `${track.name} - ${track.artists.map(artist => artist.name).join(', ')}`;
                if (!trackSet.has(trackKey)) {
                    trackSet.add(trackKey);
                    allTracks.push({
                        name: track.name,
                        artist: track.artists.map(artist => artist.name).join(', '),
                        album: track.album.name,
                        spotify_url: track.external_urls.spotify,
                        artwork: track.album.images.length > 0 ? track.album.images[0].url : null
                    });
                }
            });

            offset += limit; // Move to the next page
        }

        // Replace the user's previous entry instead of saving duplicates
        await TopTracks.findOneAndUpdate(
            { userId },
            { tracks: allTracks },
            { upsert: true, new: true }
        );

        res.send(`<h1>Saved Your Top Songs! ✅</h1>
                  <p>Your top tracks have been updated with more songs.</p>
                  <p><a href="/history">View Your Listening History</a></p>`);
    } catch (error) {
        res.send("Error fetching top tracks: " + error.message);
    }
});
app.get('/history', async (req, res) => {
    try {
        const userIdResponse = await axios.get('https://api.spotify.com/v1/me', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        const userId = userIdResponse.data.id;

        // Get the most recent top tracks entry
        const history = await TopTracks.findOne({ userId });

        if (!history || history.tracks.length === 0) {
            return res.send("<h1>No top tracks found.</h1><p>Try visiting <a href='/top-tracks'>/top-tracks</a> to save your top songs!</p>");
        }

        let historyHtml = `
        <h1>My 4-Year Spotify Wrapped 🎵</h1>
        <style>
            .track { display: flex; align-items: center; margin-bottom: 15px; }
            .track img { width: 60px; height: 60px; margin-right: 15px; border-radius: 5px; }
            .track-info { display: flex; flex-direction: column; }
        </style>
        <div>`;

        history.tracks.forEach(track => {
            historyHtml += `
                <div class="track">
                    ${track.artwork ? `<img src="${track.artwork}" alt="Album Art">` : ""}
                    <div class="track-info">
                        <strong>${track.name}</strong> - ${track.artist} 
                        (<a href="${track.spotify_url}" target="_blank">Listen</a>)
                    </div>
                </div>`;
        });

        historyHtml += `</div>`;
        res.send(historyHtml);
    } catch (error) {
        res.send("Error fetching top tracks: " + error.message);
    }
});



app.get('/', (req, res) => {
    res.send(`<h1>Welcome to the Spotify Top Tracks App</h1>
              <p><a href="/login">Login with Spotify</a></p>`);
});




// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
