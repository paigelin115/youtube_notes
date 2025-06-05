let player;
let isPlayerReady = false;
let pendingVideoId = null;
let allNotes = [];
let videoTitleMap = {};
let timestampInput;
let hasPlayed = false;

// === 工具函式 ===
function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function timeStringToSeconds(str) {
    const parts = str.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 1) return parts[0];
    return 0;
}

function extractVideoId(url) {
    url = url.trim();
    let match = url.match(/^https?:\/\/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (match) return match[1];
    match = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (match) return match[1];
    match = url.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
    if (match) return match[1];
    match = url.match(/\/v\/([a-zA-Z0-9_-]{11})/);
    if (match) return match[1];
    return null;
}

// === DOM 渲染筆記 ===
function renderNotes(notes) {
    const notesList = document.getElementById('notes');
    notesList.innerHTML = '';
    if (!notes.length) {
        notesList.innerHTML = '<li>目前沒有筆記。</li>';
        return;
    }

    // 依影片分組
    const groups = {};
    notes.forEach(note => {
        if (!groups[note.video_url]) groups[note.video_url] = [];
        groups[note.video_url].push(note);
    });

    Object.keys(groups).forEach(video_url => {
        const videoId = extractVideoId(video_url);
        const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
        const videoTitle = videoTitleMap[videoId] || '載入中...（點擊載入）';

        const groupDiv = document.createElement('div');
        groupDiv.className = 'video-group';
        groupDiv.innerHTML = `
            <div class="video-header">
                <img src="${thumbnailUrl}" width="120" style="border-radius:8px;vertical-align:middle;">
                <a href="#" class="switch-video" data-videoid="${videoId}" data-url="${video_url}" style="margin-left:10px;font-weight:bold;font-size:1.1em;">${videoTitle}</a>
            </div>
            <ul class="note-list"></ul>
        `;

        const ul = groupDiv.querySelector('.note-list');
        groups[video_url].forEach(note => {
            const timeDisplay = note.timestamp
                ? `<a href="#" class="timestamp-link" data-time="${note.timestamp}">${note.timestamp}</a>`
                : '(無時間點)';
            const li = document.createElement('li');
            li.innerHTML = `
                <div class="note-card" data-id="${note.id}">
                    <div class="note-content" style="margin-bottom:6px;">
                        時間：${timeDisplay}<br>
                        <span class="note-text">${note.content.replace(/\n/g, '<br>')}</span>
                        <textarea class="edit-area" style="display:none;width:95%;margin-top:6px;">${note.content}</textarea>
                    </div>
                    <div class="note-card-buttons">
                        <button class="edit-note-btn" data-id="${note.id}">編輯</button>
                        <button class="save-note-btn" data-id="${note.id}" style="display:none;">儲存</button>
                        <button class="delete-note-btn" data-id="${note.id}">刪除</button>
                    </div>
                </div>
            `;
            ul.appendChild(li);
        });
        notesList.appendChild(groupDiv);
    });
}

// === YouTube 事件 ===
window.onYouTubeIframeAPIReady = function() {
    player = new YT.Player('player-container', {
        width: 600,
        height: 350,
        events: {
            onReady: function () {
                isPlayerReady = true;
                if (pendingVideoId) {
                    player.loadVideoById(pendingVideoId);
                    pendingVideoId = null;
                }
            },
            onStateChange: (event) => {
                if (event.data === YT.PlayerState.PLAYING) {
                    hasPlayed = true;
                    const data = player.getVideoData();
                    if (data?.video_id && data?.title) {
                        videoTitleMap[data.video_id] = data.title;
                        renderNotes(allNotes);
                    }
                }
                if (event.data === YT.PlayerState.PAUSED && hasPlayed && timestampInput) {
                    const seconds = player.getCurrentTime();
                    timestampInput.value = formatTime(seconds);
                }
            }
        }
    });
};

// 檢查是否已經載入過 YouTube API，如果沒有才載入
if (!window.YT || !window.YT.Player) {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
}

// === 初始化 ===
document.addEventListener('DOMContentLoaded', () => {
    timestampInput = document.getElementById('timestamp-input');
    const noteText = document.getElementById('note-text');
    const noteVideoUrl = document.getElementById('video-url-input');
    const inputVideoUrl = document.getElementById('input-video-url');
    const searchInput = document.getElementById('search-input');
    const notesList = document.getElementById('notes');

    // 時間輸入快速跳轉
    timestampInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const seconds = timeStringToSeconds(timestampInput.value.trim());
            if (isPlayerReady && player?.seekTo) {
                player.seekTo(seconds, true);
                player.pauseVideo();
            }
        }
    });

    document.getElementById('load-video-btn').addEventListener('click', () => {
        const url = inputVideoUrl.value.trim();
        const videoId = extractVideoId(url);
        if (!videoId) return alert('無法解析影片 ID');
        noteVideoUrl.value = url;
        isPlayerReady ? player.loadVideoById(videoId) : pendingVideoId = videoId;
    });

    document.getElementById('save-note').addEventListener('click', () => {
        const content = noteText.value.trim();
        const videoUrl = noteVideoUrl.value.trim();
        let timestamp = timestampInput.value.trim();
        if (!videoUrl || !content) return alert('請輸入影片網址與筆記內容');
        if (!timestamp && isPlayerReady) timestamp = formatTime(player.getCurrentTime());

        fetch('/add_note', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ video_url: videoUrl, timestamp, content })
        }).then(res => {
            if (res.ok) {
                loadNotes();
                timestampInput.value = '';
                noteText.value = '';
            }
        });
    });

    searchInput.addEventListener('input', () => {
        const keyword = searchInput.value.trim().toLowerCase();
        const filtered = allNotes.filter(note =>
            note.content.toLowerCase().includes(keyword) ||
            note.video_url.toLowerCase().includes(keyword) ||
            (note.timestamp?.toLowerCase().includes(keyword))
        );
        renderNotes(filtered);
    });

    notesList.addEventListener('click', (e) => {
        const target = e.target;
        if (target.classList.contains('switch-video')) {
            e.preventDefault();
            noteVideoUrl.value = target.dataset.url;
            const videoId = extractVideoId(target.dataset.url);
            if (isPlayerReady && player) {
                player.loadVideoById(videoId);
            } else {
                pendingVideoId = videoId;
            }
        }

        if (target.classList.contains('delete-note-btn')) {
            const noteId = target.dataset.id;
            if (confirm('確定要刪除這則筆記嗎？')) {
                fetch(`/delete_note/${noteId}`, { method: 'DELETE' })
                    .then(res => res.ok && loadNotes());
            }
        }

        if (target.classList.contains('edit-note-btn')) {
            const card = target.closest('.note-card');
            card.querySelector('.note-text').style.display = 'none';
            card.querySelector('.edit-area').style.display = '';
            target.style.display = 'none';
            card.querySelector('.save-note-btn').style.display = '';
        }

        if (target.classList.contains('save-note-btn')) {
            const card = target.closest('.note-card');
            const noteId = target.dataset.id;
            const newContent = card.querySelector('.edit-area').value.trim();
            fetch(`/edit_note/${noteId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ content: newContent })
            }).then(res => res.ok && loadNotes());
        }

        if (target.classList.contains('timestamp-link')) {
            e.preventDefault();
            const seconds = timeStringToSeconds(target.dataset.time);
            if (isPlayerReady && player) {
                player.seekTo(seconds, true);
                player.pauseVideo();
            }
        }
    });

    // 初始載入
    loadNotes();
});

function loadNotes() {
    fetch('/api/notes')
        .then(res => res.json())
        .then(data => {
            allNotes = data;
            renderNotes(allNotes);
        });
}