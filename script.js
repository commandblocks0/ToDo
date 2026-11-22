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
const contextMenu = document.querySelector("#contextmenu");

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
    placeholder: null,
    latestY: 0,
    lastFrameTime: 0,
    rafId: null
};
let selectedTodo = null;

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
} catch (error) { }

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
    if (dragState.active) {
        cleanupDragState();
    }

    todosWrapper.innerHTML = "";
    const renderedTodos = [];
    for (let i = 0; i < todos.length; i++) {
        const todo = document.querySelector(".todo-template").content.cloneNode(true).querySelector(".todo");
        todo.setAttribute("data-id", todos[i].id);
        todosWrapper.appendChild(todo);
        renderedTodos.push(todo);

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

        todo.addEventListener("pointerdown", (e) => {
            if (text.isContentEditable) return
            if (dragState.active) return;
            if (e.pointerType === "mouse" && e.button !== 0) return;
            if (e.target.closest(".reorder")) return;
            if (e.target.closest(".remove")) return;

            startX = e.clientX;
            todo.setPointerCapture(e.pointerId);
        });

        todo.addEventListener("pointermove", (e) => {
            if (dragState.active || startX == null) return;

            const distance = Math.max(0, e.clientX - startX);

            todo.style.transform = `translateX(${distance}px)`;
            todo.style.opacity = Math.max(0, 1 - Math.abs(distance) / 200);
        });

        todo.addEventListener("pointerup", (e) => {
            if (dragState.active || startX == null) return;

            const distance = Math.max(0, e.clientX - startX);
            startX = null;

            if (Math.abs(distance) > 200) {
                if (!confirm("Are you sure?")) {
                    todo.style.transform = "";
                    todo.style.opacity = "";
                    return;
                }

                const id = todo.dataset.id;
                const index = todos.findIndex(item => item.id === id);

                if (index !== -1) {
                    todos.splice(index, 1);

                    if (lastUserId) {
                        if (!changes[lastUserId]) changes[lastUserId] = [];
                        changes[lastUserId].push({
                            type: "remove",
                            id
                        });
                    }

                    save();
                    load();
                }
            } else {
                todo.style.transform = "";
                todo.style.opacity = "";
            }
        });

        todo.addEventListener("pointercancel", () => {
            startX = null;
            todo.style.transform = "";
            todo.style.opacity = "";
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

        todo.addEventListener("contextmenu", (e) => {
            if (text.isContentEditable) return

            e.preventDefault();

            selectedTodo = todo

            contextMenu.style.left = `${e.clientX}px`;
            contextMenu.style.top = `${e.clientY}px`;

            contextMenu.showPopover();
        });
    }

    if (anim) {
        runVisibleTodoIntroAnimations(renderedTodos);
    }
}

function runVisibleTodoIntroAnimations(todoElements) {
    const visibleTodos = todoElements.filter(isTodoVisibleInWrapper);
    if (visibleTodos.length === 0) return;

    visibleTodos.forEach((todo) => {
        todo.style.translate = "-100vw 0";
    });

    void todosWrapper.offsetHeight;

    requestAnimationFrame(() => {
        visibleTodos.forEach((todo, index) => {
            setTimeout(() => {
                if (!todo.isConnected) return;
                todo.style.translate = "0 0";
            }, index * 60);
        });
    });
}

window.todoDebug = window.todoDebug || {};
window.todoDebug.load = load;
window.loadTodos = (anim = false) => load(anim);
globalThis.loadTodos = window.loadTodos;

function isTodoVisibleInWrapper(todo) {
    const wrapperIsScrollable = todosWrapper.scrollHeight > todosWrapper.clientHeight + 1;
    const todoRect = todo.getBoundingClientRect();
    let rootTop;
    let rootBottom;

    if (wrapperIsScrollable) {
        const wrapperRect = todosWrapper.getBoundingClientRect();
        rootTop = wrapperRect.top;
        rootBottom = wrapperRect.bottom;
    } else {
        rootTop = 0;
        rootBottom = window.innerHeight || document.documentElement.clientHeight;
    }

    const overscan = 80;
    const expandedTop = rootTop - overscan;
    const expandedBottom = rootBottom + overscan;
    const visiblePixels = Math.min(todoRect.bottom, rootBottom) - Math.max(todoRect.top, rootTop);
    const visibleRatio = visiblePixels / Math.max(todoRect.height, 1);
    const nearViewport = todoRect.bottom > expandedTop && todoRect.top < expandedBottom;

    return visibleRatio >= 0.6 || (nearViewport && visibleRatio > 0);
}

function save() {
    localStorage.setItem("todos", JSON.stringify(todos));
    localStorage.setItem("changes", JSON.stringify(changes));
    sync();
}

function applyChanges(array, array2) {
    for (let change of array2) {
        if (change.type === "add") {
            if (array.find(item => item.id === change.id)) continue;
            let index = Number(change.index);
            if (!Number.isInteger(index)) index = array.length;
            if (index < 0) index = 0;
            if (index > array.length) index = array.length;
            array.splice(index, 0, { text: change.value, id: change.id });
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
    syncQueue = syncQueue.then(async () => {
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
        dragState.latestY = e.clientY;
        dragState.lastFrameTime = 0;

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
        dragState.rafId = requestAnimationFrame(updateDrag);
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
    if (dragState.rafId !== null) {
        cancelAnimationFrame(dragState.rafId);
        dragState.rafId = null;
    }

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
    dragState.latestY = 0;
    dragState.lastFrameTime = 0;
}

function recordReorderChange(id, targetIndex) {
    if (!lastUserId) return;
    if (!changes[lastUserId]) changes[lastUserId] = [];
    changes[lastUserId].push({ type: "move", id, index: targetIndex });
}

function handlePointerMove(e) {
    if (!dragState.active) return;
    if (dragState.pointerId !== null && e.pointerId !== dragState.pointerId) return;

    e.preventDefault();
    dragState.latestY = e.clientY;
}

function updateDrag(timestamp) {
    if (!dragState.active || !dragState.draggedEl || !dragState.placeholder) {
        dragState.rafId = null;
        return;
    }

    if (dragState.placeholder.parentNode !== todosWrapper) {
        cleanupDragState();
        load();
        return;
    }

    const y = dragState.latestY;
    const rect = todosWrapper.getBoundingClientRect();
    const edgeSize = Math.min(90, rect.height / 3);
    const maxScrollSpeed = 900;

    let scrollDirection = 0;
    let intensity = 0;

    if (y < rect.top + edgeSize) {
        scrollDirection = -1;
        intensity = Math.min(1, (rect.top + edgeSize - y) / edgeSize);
    } else if (y > rect.bottom - edgeSize) {
        scrollDirection = 1;
        intensity = Math.min(1, (y - (rect.bottom - edgeSize)) / edgeSize);
    }

    if (dragState.lastFrameTime) {
        const deltaTime = Math.min((timestamp - dragState.lastFrameTime) / 1000, 0.05);
        todosWrapper.scrollTop += scrollDirection * maxScrollSpeed * intensity * deltaTime;
    }
    dragState.lastFrameTime = timestamp;

    dragState.draggedEl.style.top = `${y - dragState.offsetY}px`;

    const placeholder = dragState.placeholder;
    const afterElement = getDragAfterElement(todosWrapper, y);

    if (afterElement) {
        if (placeholder.nextElementSibling !== afterElement) {
            todosWrapper.insertBefore(placeholder, afterElement);
        }
    } else if (todosWrapper.lastElementChild !== placeholder) {
        todosWrapper.appendChild(placeholder);
    }

    dragState.rafId = requestAnimationFrame(updateDrag);
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


function addTodo(text, pos) {
    const id = Math.random().toString(16).slice(2);
    let index;

    if (pos === "current") {
        index = getCurrentIndex();
    } else if (pos === "top") {
        index = 0;
    } else {
        index = todos.length;
    }

    todos.splice(index, 0, { text: text.trim(), id });

    if (lastUserId) {
        if (!changes[lastUserId]) changes[lastUserId] = [];
        changes[lastUserId].push({
            type: "add",
            value: text,
            id,
            index
        });
    }

    save();
    load(true);
}

function getCurrentIndex() {
    const todosEls = [...todosWrapper.querySelectorAll(".todo:not(.placeholder)")];
    const containerRect = todosWrapper.getBoundingClientRect();

    for (let i = 0; i < todosEls.length; i++) {
        const rect = todosEls[i].getBoundingClientRect();
        if (rect.top+rect.height/2 > containerRect.top) return i;
    }

    return 0
}

function setCreatePopupVisible(bool) {
    const popup = document.querySelector(".create-popup")
    popup.style.display = "flex"
    popup.animate([
        { scale: bool ? 0 : 1 }, { scale: bool ? 1 : 0 }
    ], {
        duration: 100,
        fill: "forwards"
    })
    if (bool) popup.classList.add("open")
    else popup.classList.remove("open")
    setTimeout(() => {
        if (!bool) popup.style.display = "none"
    }, 300)
}

document.querySelector(".open-create").addEventListener("click", () => {
    setCreatePopupVisible(true)
    document.getElementById("create-text").value = ""
    document.getElementById("create-text").focus()
})

document.getElementById("create-create").addEventListener("click", () => {
    const text = document.getElementById("create-text")

    if (text.value.trim() == "") return

    if (document.getElementById("create-current").checked) {
        addTodo(text.value, "current")
    } else if (document.getElementById("create-top").checked) {
        addTodo(text.value, "top")
    } else {
        addTodo(text.value, "bottom")
    }

    setCreatePopupVisible(false)
})

document.getElementById("create-close").addEventListener("click", () => setCreatePopupVisible(false))

document.querySelectorAll(".create-pos-option").forEach(el => {
    el.addEventListener("click", () => {
        el.querySelector("input").checked = true
    })
})

document.addEventListener("keydown", (e) => {
    if (!document.querySelector(".create-popup").classList.contains("open")) return
    if (e.key === "Escape") {
        setCreatePopupVisible(false)
    }
    if (e.key === "Enter") {
        document.getElementById("create-create").click()
    }
})

document.querySelector(".contextmenu-movetop").addEventListener("click", () => {
    contextMenu.hidePopover();

    if (!selectedTodo) return;

    const id = selectedTodo.dataset.id;
    const index = todos.findIndex(item => item.id === id);

    if (index === -1 || index === 0) return;

    const [todo] = todos.splice(index, 1);
    todos.unshift(todo);

    recordReorderChange(id, 0);

    save();
    load();
});

document.addEventListener("pointerdown", (e) => {
    if (
        contextMenu.matches(":popover-open") &&
        !contextMenu.contains(e.target)
    ) {
        contextMenu.hidePopover();
    }
});

window.visualViewport.addEventListener('resize', () => {
    const vh = window.visualViewport.height;
    document.querySelector(".create-popup").style.top = (vh / 2) + 'px';
});

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js")
        .then(() => console.log("Service Worker registered"));
}
