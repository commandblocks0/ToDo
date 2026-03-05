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
let dragState = {
    active: false,
    draggedId: null,
    draggedEl: null,
    pointerId: null,
    offsetY: 0,
    placeholder: null
};

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

authButton.addEventListener("click", () => {
    if (userId) {
        auth.signOut()
    } else {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        signInWithPopup(auth, provider)
    }
});

function load(anim = false) {
    todosWrapper.innerHTML = "";
    for (let i = 0; i < todos.length; i++) {
        const todo = document.querySelector(".todo-template").content.cloneNode(true).querySelector(".todo");
        todo.setAttribute("data-id", todos[i].id);
        todosWrapper.appendChild(todo);

        if (anim) {
            todo.style.translate = "-100vw 0";
            setTimeout(() => {
                todo.style.translate = "0 0";
            }, i * 100);
        }

        const text = todo.querySelector(".text");
        const reorderBtn = todo.querySelector(".reorder");
        text.innerText = todos[i].text;

        enableDragByHandle(todo, reorderBtn);

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

        let startX = null;
        todo.addEventListener("touchstart", (e) => {
            if (dragState.active) return;
            startX = e.touches[0].clientX;
        });

        todo.addEventListener("touchend", (e) => {
            if (dragState.active || startX==null) return;
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
            if (dragState.active || startX==null) return;
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
            if (array.find(item => item.id === change.id)) continue
            array.unshift({ text: change.value, id: change.id });
        } else if (change.type === "addBottom") {
            if (array.find(item => item.id === change.id)) continue
            array.push({ text: change.value, id: change.id });
        } else if (change.type === "remove") {
            const index = array.findIndex(item => item.id === change.id);
            if (index !== -1) array.splice(index, 1);
        } else if (change.type === "edit") {
            const index = array.findIndex(item => item.id === change.id);
            if (index !== -1) array[index].text = change.value;
        } else if (change.type === "move") {
            const fromIndex = array.findIndex(item => item.id === change.id);
            if (fromIndex === -1) continue;
            let targetIndex = Number(change.index);
            if (!Number.isInteger(targetIndex)) continue;
            if (targetIndex < 0) targetIndex = 0;
            if (targetIndex >= array.length) targetIndex = array.length - 1;
            const [movedTodo] = array.splice(fromIndex, 1);
            array.splice(targetIndex, 0, movedTodo);
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

function enableDragByHandle(todo, reorderBtn) {
    reorderBtn.addEventListener("pointerdown", (e) => {
        if (dragState.active) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.preventDefault();

        const rect = todo.getBoundingClientRect();
        const placeholder = document.createElement("div");
        placeholder.className = "todo placeholder";
        placeholder.style.height = `${rect.height}px`;
        todosWrapper.insertBefore(placeholder, todo.nextSibling);

        dragState.active = true;
        dragState.draggedId = todo.dataset.id;
        dragState.draggedEl = todo;
        dragState.pointerId = e.pointerId;
        dragState.offsetY = e.clientY - rect.top;
        dragState.placeholder = placeholder;

        todo.classList.add("dragging");
        todo.style.width = `${rect.width}px`;
        todo.style.height = `${rect.height}px`;
        todo.style.position = "fixed";
        todo.style.left = `${rect.left}px`;
        todo.style.top = `${rect.top}px`;
        todo.style.zIndex = "1000";
        todo.style.pointerEvents = "none";

        document.body.appendChild(todo);
        document.body.classList.add("reordering");

        document.addEventListener("pointermove", handlePointerMove, { passive: false });
        document.addEventListener("pointerup", handlePointerUp);
        document.addEventListener("pointercancel", handlePointerUp);
    });
}

function getDragAfterElement(container, y) {
    const draggableItems = [...container.querySelectorAll(".todo:not(.dragging):not(.placeholder)")];

    return draggableItems.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset, element: child };
        }
        return closest;
    }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
}

function cleanupDragState() {
    if (dragState.draggedEl) {
        dragState.draggedEl.classList.remove("dragging");
        dragState.draggedEl.style.width = "";
        dragState.draggedEl.style.height = "";
        dragState.draggedEl.style.position = "";
        dragState.draggedEl.style.left = "";
        dragState.draggedEl.style.top = "";
        dragState.draggedEl.style.zIndex = "";
        dragState.draggedEl.style.pointerEvents = "";
        dragState.draggedEl.style.transform = "";
        if (dragState.draggedEl.isConnected) {
            dragState.draggedEl.remove();
        }
    }
    if (dragState.placeholder && dragState.placeholder.isConnected) {
        dragState.placeholder.remove();
    }
    document.body.classList.remove("reordering");
    document.removeEventListener("pointermove", handlePointerMove);
    document.removeEventListener("pointerup", handlePointerUp);
    document.removeEventListener("pointercancel", handlePointerUp);
    dragState.active = false;
    dragState.draggedId = null;
    dragState.draggedEl = null;
    dragState.pointerId = null;
    dragState.offsetY = 0;
    dragState.placeholder = null;
}

function recordReorderChange(id, targetIndex) {
    if (!lastUserId) return;
    if (!changes[lastUserId]) changes[lastUserId] = [];
    changes[lastUserId].push({ type: "move", id, index: targetIndex });
}

function handlePointerMove(e) {
    if (!dragState.active || !dragState.draggedEl || !dragState.placeholder) return;
    if (dragState.pointerId !== null && e.pointerId !== dragState.pointerId) return;

    e.preventDefault();
    dragState.draggedEl.style.top = `${e.clientY - dragState.offsetY}px`;

    const afterElement = getDragAfterElement(todosWrapper, e.clientY);
    if (afterElement) {
        todosWrapper.insertBefore(dragState.placeholder, afterElement);
    } else {
        todosWrapper.appendChild(dragState.placeholder);
    }
}

function handlePointerUp(e) {
    if (!dragState.active || !dragState.placeholder || !dragState.draggedId) return;
    if (dragState.pointerId !== null && e.pointerId !== dragState.pointerId) return;

    const fromIndex = todos.findIndex((item) => item.id === dragState.draggedId);
    if (fromIndex === -1) {
        cleanupDragState();
        load();
        return;
    }

    let nextTodo = dragState.placeholder.nextElementSibling;
    while (nextTodo && nextTodo.classList.contains("placeholder")) {
        nextTodo = nextTodo.nextElementSibling;
    }

    let targetIndex = todos.length;
    if (nextTodo) {
        targetIndex = todos.findIndex((item) => item.id === nextTodo.dataset.id);
        if (targetIndex === -1) targetIndex = todos.length;
    }

    if (fromIndex < targetIndex) targetIndex -= 1;

    if (targetIndex !== fromIndex) {
        const [movedTodo] = todos.splice(fromIndex, 1);
        todos.splice(targetIndex, 0, movedTodo);
        recordReorderChange(movedTodo.id, targetIndex);
        save();
    }

    cleanupDragState();
    load();
}


// create todo
function addTodo(text, top) {
    const id = Math.random().toString(16).slice(2);
    if (lastUserId && !changes[lastUserId]) changes[lastUserId] = [];
    if (top) {
        todos.unshift({ text: text.trim(), id });
        if (lastUserId) {
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

function setCreatePopupVisible(bool) {
    const popup = document.querySelector(".create-popup")
    popup.style.display = "flex"
    popup.animate([
        {scale: bool ? 0 : 1}, {scale: bool ? 1 : 0}
    ],{
        duration: 100,
        fill: "forwards"
    })
    setTimeout(()=>{
        if (!bool) popup.style.display = "none"
    },300)
}

document.querySelector(".open-create").addEventListener("click",()=>{
    setCreatePopupVisible(true)
    document.getElementById("create-text").focus()
})

document.getElementById("create-create").addEventListener("click",()=>{
    const text = document.getElementById("create-text")
    const top = document.getElementById("create-top").checked
    
    if (text.value.trim()=="") return
    addTodo(text.value, top)
    setCreatePopupVisible(false)
})

document.getElementById("create-cancel").addEventListener("click", ()=>setCreatePopupVisible(false))