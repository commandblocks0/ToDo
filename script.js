import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { doc, getDoc, setDoc, getFirestore } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const todos = JSON.parse(localStorage.getItem("todos")) || [];
const changes = JSON.parse(localStorage.getItem("changes")) || {};

const addTopBtn = document.querySelector(".add-top");
const addBottomBtn = document.querySelector(".add-bottom");
const todosWrapper = document.querySelector(".todos-wrapper");
const authButton = document.querySelector(".auth-button");
const loginIndicator = authButton.querySelector(".login");
const logoutIndicator = authButton.querySelector(".logout");

const firebaseConfig = {
    apiKey: "AIzaSyB8fvKr0vTYsSAgBoDM79B-ybJVPMKUTMg",
    authDomain: "todo-aaaee.firebaseapp.com",
    projectId: "todo-aaaee",
    storageBucket: "todo-aaaee.firebasestorage.app",
    messagingSenderId: "760329584422",
    appId: "1:760329584422:web:be94afe3fd3272b5b54be7",
    measurementId: "G-1662SYRKYB"
};

let userId = null;
let lastUserId = localStorage.getItem("lastUserId") || null;
let syncQueue = Promise.resolve()

load(true);
let db, auth
try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore();
    auth = getAuth();

    onAuthStateChanged(auth, (user) => {
        if (user) {
            userId = user.uid;
            lastUserId = userId;
            localStorage.setItem("lastUserId", userId);
            loginIndicator.classList.add("hidden");
            logoutIndicator.classList.remove("hidden");
            sync().then(() => {
                load(true);
            });
        } else {
            userId = null;
            loginIndicator.classList.remove("hidden");
            logoutIndicator.classList.add("hidden");
        }
    })
} catch (error) {}

addTopBtn.addEventListener("click", () => addTodo("top"));
addBottomBtn.addEventListener("click", () => addTodo("bottom"));

authButton.addEventListener("click", () => {
    if (userId) {
        auth.signOut()
    } else {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        signInWithPopup(auth, provider)
    }
});

function addTodo(type = "top") {
    const text = prompt("ToDo");
    if (!text || !text.trim()) return;
    const id = Date.now().toString() + Math.random().toString(16).slice(2);
    if (type === "top") {
        todos.unshift({ text: text.trim(), id });
        if (lastUserId) {
            if (!changes[lastUserId]) changes[lastUserId] = [];
            changes[lastUserId].push({ type: "addTop", value: text, id });
        }
    } else {
        todos.push({ text: text.trim(), id });
        if (lastUserId) {
            changes[lastUserId].push({ type: "addBottom", value: text, id });
        }
    }
    save();
    load(true);
}

function load(anim = false) {
    todosWrapper.innerHTML = "";
    for (let i = 0; i < todos.length; i++) {
        const todo = document.querySelector(".todo-template").content.cloneNode(true).querySelector(".todo");
        todo.setAttribute("data-index", i);
        todosWrapper.appendChild(todo);

        if (anim) {
            todo.style.translate = "-100vw 0";
            setTimeout(() => {
                todo.style.translate = "0 0";
            }, i * 100);
        }

        const text = todo.querySelector(".text");
        text.innerText = todos[i].text;

        todo.querySelector(".remove").addEventListener("click", () => {
            if (!confirm("Are you sure?")) return;
            const id = todos[i].id;
            todos.splice(i, 1);
            if (lastUserId) {
                if (!changes[lastUserId]) changes[lastUserId] = [];
                changes[lastUserId].push({ type: "remove", id });
            }
            save();
            load();
        });

        todo.querySelector(".up").addEventListener("click", () => {
            if (i === 0) return;
            const id = todos[i].id;
            [todos[i - 1], todos[i]] = [todos[i], todos[i - 1]];
            if (lastUserId) {
                if (!changes[lastUserId]) changes[lastUserId] = [];
                changes[lastUserId].push({ type: "moveUp", id });
            }
            save();
            load();
        });

        todo.querySelector(".down").addEventListener("click", () => {
            if (i === todos.length - 1) return;
            const id = todos[i].id;
            [todos[i], todos[i + 1]] = [todos[i + 1], todos[i]];
            if (lastUserId) {
                if (!changes[lastUserId]) changes[lastUserId] = [];
                changes[lastUserId].push({ type: "moveDown", id });
            }
            save();
            load();
        });

        let startX = null;
        todo.addEventListener("touchstart", (e) => {
            startX = e.touches[0].clientX;
        });

        todo.addEventListener("touchend", (e) => {
            const endX = e.changedTouches[0].clientX;
            todo.style.opacity = 1;
            if (Math.abs(endX - startX) > 200) {
                if (!confirm("Are you sure?")) return;
                const id = todos[i].id;
                todos.splice(i, 1);
                if (lastUserId) {
                    if (!changes[lastUserId]) changes[lastUserId] = [];
                    changes[lastUserId].push({ type: "remove", id });
                }
                save();
                load();
            }
        });

        todo.addEventListener("touchmove", (e) => {
            const endX = e.changedTouches[0].clientX;
            todo.style.opacity = 1 - Math.abs(endX - startX) / 200;
        });

        todo.addEventListener("dblclick", () => {
            text.contentEditable = "true";
            text.focus();
            text.addEventListener("blur", function handleBlur() {
                text.contentEditable = "false";
                todos[i].text = text.innerText.trim();
                if (lastUserId) {
                    if (!changes[lastUserId]) changes[lastUserId] = [];
                    changes[lastUserId].push({ type: "edit", id: todos[i].id, value: todos[i].text });
                }
                save();
                load();
            }, { once: true });
        });
    }
}

function save() {
    localStorage.setItem("todos", JSON.stringify(todos));
    localStorage.setItem("changes", JSON.stringify(changes));
    sync();
}

function applyChanges(array, array2) {
    for (let change of array2) {
        if (change.type === "addTop") {
            array.unshift({ text: change.value, id: change.id });
        } else if (change.type === "addBottom") {
            array.push({ text: change.value, id: change.id });
        } else if (change.type === "remove") {
            const index = array.findIndex(item => item.id === change.id);
            if (index !== -1) array.splice(index, 1);
        } else if (change.type === "edit") {
            const index = array.findIndex(item => item.id === change.id);
            if (index !== -1) array[index].text = change.value;
        } else if (change.type === "moveUp") {
            const index = array.findIndex(item => item.id === change.id);
            if (index > 0) [array[index - 1], array[index]] = [array[index], array[index - 1]];
        } else if (change.type === "moveDown") {
            const index = array.findIndex(item => item.id === change.id);
            if (index !== -1 && index < array.length - 1) [array[index], array[index + 1]] = [array[index + 1], array[index]];
        }
    }
    return array;
}

function sync() {
    syncQueue = syncQueue.then(async()=>{
        if (!userId) return;
        const docSnap = await getDoc(doc(db, "data", userId));
        const cloudTodos = docSnap.exists() ? docSnap.data().todoList || [] : [];
        const updatedTodos = applyChanges(cloudTodos, changes[userId] || []);
        await setDoc(doc(db, "data", userId), {
            todoList: updatedTodos
        })

        todos.length = 0;
        delete changes[userId];
        todos.push(...updatedTodos);
        localStorage.setItem("todos", JSON.stringify(todos));
        localStorage.setItem("changes", JSON.stringify(changes));
    }).catch(console.error)
    return syncQueue
}