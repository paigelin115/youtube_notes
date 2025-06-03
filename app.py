from flask import Flask, render_template, request, jsonify, redirect, url_for, session
import sqlite3
from werkzeug.security import generate_password_hash, check_password_hash
from flask import Flask, render_template, request, redirect, session, url_for

app = Flask(__name__)
app.secret_key = "xup6qo4fu62k70fm06au4a83"  #是 Flask 應用程式用來加密 session（用戶登入狀態等資料）的「祕密金鑰」。這個字串必須很長、很亂、不能被別人猜到，否則別人可能偽造你的 session，造成安全漏洞。

# 取得資料庫連線
def get_db_connection():
    conn = sqlite3.connect('notes.db')
    conn.row_factory = sqlite3.Row  # 讓查詢結果可以用欄位名稱存取
    return conn

# 初始化資料庫，建立 users 與 notes 表
def init_db():
    conn = get_db_connection()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            video_url TEXT NOT NULL,
            timestamp TEXT,
            content TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')
    conn.commit()
    conn.close()

# 首頁：若已登入則顯示主頁，否則導向登入頁
@app.route("/")
def index():
    if "user_id" in session:
        username = session.get("username")
        return render_template("index.html", username=username)
    else:
        return redirect(url_for("login"))

# 註冊頁與註冊處理
@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        username = request.form["username"]
        password = request.form["password"]
        hashed_password = generate_password_hash(password)

        conn = get_db_connection()
        try:
            conn.execute(
                "INSERT INTO users (username, password) VALUES (?, ?)",
                (username, hashed_password)
            )
            conn.commit()
        except sqlite3.IntegrityError:
            conn.close()
            return "使用者名稱已存在，請換一個", 400
        conn.close()
        return redirect(url_for("login"))
    else:
        return render_template("register.html")

# 登入頁與登入處理
@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form["username"]
        password = request.form["password"]

        conn = get_db_connection()
        user = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        conn.close()

        if user and check_password_hash(user["password"], password):
            session["user_id"] = user["id"]
            session["username"] = user["username"]
            return redirect(url_for("index"))
        else:
            return "登入失敗，帳號或密碼錯誤", 400
    else:
        return render_template("login.html")

# 登出
@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))

# 新增筆記
@app.route("/add_note", methods=["POST"])
def add_note():
    if "user_id" not in session:
        return jsonify({"success": False, "message": "請先登入"}), 401

    video_url = request.form["video_url"]
    timestamp = request.form.get("timestamp", "")
    content = request.form["content"]
    user_id = session["user_id"]

    conn = get_db_connection()
    conn.execute(
        "INSERT INTO notes (user_id, video_url, timestamp, content) VALUES (?, ?, ?, ?)",
        (user_id, video_url, timestamp, content)
    )
    conn.commit()
    conn.close()

    return jsonify({"success": True})

# 取得目前使用者的所有筆記（API）
@app.route("/api/notes")
def get_notes():
    if "user_id" not in session:
        return jsonify([])

    user_id = session["user_id"]
    conn = get_db_connection()
    notes = conn.execute("SELECT * FROM notes WHERE user_id = ?", (user_id,)).fetchall()
    conn.close()

    notes_list = [
        {
            "id": note["id"],
            "video_url": note["video_url"],
            "timestamp": note["timestamp"],
            "content": note["content"]
        }
        for note in notes
    ]
    return jsonify(notes_list)

# 刪除筆記
@app.route("/delete_note/<int:note_id>", methods=["DELETE"])
def delete_note(note_id):
    if "user_id" not in session:
        return jsonify({"success": False, "message": "請先登入"}), 401

    user_id = session["user_id"]
    conn = get_db_connection()
    conn.execute("DELETE FROM notes WHERE id = ? AND user_id = ?", (note_id, user_id))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

# 編輯筆記內容
@app.route("/edit_note/<int:note_id>", methods=["POST"])
def edit_note(note_id):
    if "user_id" not in session:
        return jsonify({"success": False, "message": "請先登入"}), 401

    content = request.form["content"]
    user_id = session["user_id"]

    conn = get_db_connection()
    conn.execute(
        "UPDATE notes SET content = ? WHERE id = ? AND user_id = ?",
        (content, note_id, user_id)
    )
    conn.commit()
    conn.close()
    return jsonify({"success": True})

# 忘記密碼：可重設密碼
@app.route('/forgot_password', methods=['GET', 'POST'])
def forgot_password():
    if request.method == 'POST':
        username = request.form['username']
        new_password = request.form['new_password']
        hashed_password = generate_password_hash(new_password)

        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute('SELECT * FROM users WHERE username = ?', (username,))
        user = cursor.fetchone()
        if not user:
            conn.close()
            return '找不到該使用者名稱', 404

        # 更新密碼
        cursor.execute('UPDATE users SET password = ? WHERE username = ?', (hashed_password, username))
        conn.commit()
        conn.close()

        return '密碼已重設，請重新登入。<a href="/login">登入</a>'
    
    return render_template('forgot_password.html')

# 顯示所有筆記（管理用途）
@app.route('/all_notes')
def all_notes():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT notes.id, users.username, notes.video_url, notes.timestamp, notes.content
        FROM notes
        JOIN users ON notes.user_id = users.id
    ''')
    notes = cursor.fetchall()
    conn.close()
    return render_template('all_notes.html', notes=notes)


# 啟動應用程式
if __name__ == "__main__":
    init_db()  # 啟動時自動建立資料表
    app.run(debug=True)