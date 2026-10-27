"use strict";

document.addEventListener("DOMContentLoaded", () => {
    // Get HTML elements
    const form = document.getElementById("task-form");
    const input = document.getElementById("task-input");
    const taskList = document.getElementById("task-list");
    const taskCount = document.getElementById("task-count");
    const emptyState = document.getElementById("empty-state");
    const message = document.getElementById("message");
    const addButton = document.getElementById("add-button");
    const filters = document.querySelectorAll(".filter");

    // Stop early if the HTML IDs don't match
    if (!form || !input || !taskList || !taskCount ||
        !emptyState || !message || !addButton || filters.length === 0) {
        console.error(
            "Task Manager: Required HTML elements are missing. " +
            "Check index.html IDs and classes."
        );
        return;
    }

    let tasks = [];
    let currentFilter = "all";
    let isLoading = false;

    console.log("Task Manager JavaScript initialized.");

    // Show messages to the user
    function showMessage(text = "", isError = false) {
        message.textContent = text;
        message.style.color = isError ? "#b42318" : "#16803d";
    }

    // Communicate with the Flask backend
    async function api(url, options = {}) {
        let response;

        try {
            response = await fetch(url, {
                ...options,
                headers: {
                    "Content-Type": "application/json",
                    ...options.headers
                }
            });
        } catch (error) {
            console.error("Network error:", error);
            throw new Error(
                "Cannot connect to Flask. Make sure python app.py is running."
            );
        }

        const contentType =
            response.headers.get("content-type") || "";

        if (!contentType.includes("application/json")) {
            console.error(
                "Unexpected server response:",
                response.status,
                url
            );
            throw new Error(
                "Server returned an unexpected response. Check Flask and the API URL."
            );
        }

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || `Request failed with status ${response.status}.`
            );
        }

        return data;
    }

    // Create a task row safely
    function createTaskElement(task) {
        const item = document.createElement("li");
        item.className = "task";

        if (task.completed) {
            item.classList.add("done");
        }

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = Boolean(task.completed);
        checkbox.setAttribute(
            "aria-label",
            `Mark ${task.title} as completed`
        );
        checkbox.disabled = isLoading;

        const title = document.createElement("span");
        title.className = "task-title";
        title.textContent = task.title;

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "delete-button";
        deleteButton.textContent = "Delete";
        deleteButton.disabled = isLoading;
        deleteButton.setAttribute(
            "aria-label",
            `Delete ${task.title}`
        );

        // Complete or reopen a task
        checkbox.addEventListener("change", async () => {
            const previousValue = !checkbox.checked;
            checkbox.disabled = true;
            showMessage();

            try {
                await api(`/api/tasks/${task.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({
                        completed: checkbox.checked
                    })
                });

                await loadTasks();
                showMessage("Task status updated.");
            } catch (error) {
                checkbox.checked = previousValue;
                showMessage(error.message, true);
            } finally {
                checkbox.disabled = false;
            }
        });

        // Delete a task
        deleteButton.addEventListener("click", async () => {
            deleteButton.disabled = true;
            showMessage();

            try {
                await api(`/api/tasks/${task.id}`, {
                    method: "DELETE"
                });

                await loadTasks();
                showMessage("Task deleted successfully.");
            } catch (error) {
                showMessage(error.message, true);
                deleteButton.disabled = false;
            }
        });

        item.append(checkbox, title, deleteButton);
        return item;
    }

    // Render tasks according to the selected filter
    function renderTasks() {
        taskList.replaceChildren();

        const visibleTasks = tasks.filter(task => {
            if (currentFilter === "pending") {
                return !task.completed;
            }

            if (currentFilter === "completed") {
                return Boolean(task.completed);
            }

            return true;
        });

        const completedCount = tasks.filter(
            task => Boolean(task.completed)
        ).length;

        taskCount.textContent =
            `${completedCount}/${tasks.length} completed`;

        emptyState.hidden = visibleTasks.length > 0;

        if (tasks.length === 0) {
            emptyState.textContent =
                "No tasks yet. Add your first task above!";
        } else if (visibleTasks.length === 0) {
            emptyState.textContent =
                "No tasks match this filter.";
        }

        visibleTasks.forEach(task => {
            taskList.appendChild(createTaskElement(task));
        });
    }

    // Load tasks from the Python/CSV backend
    async function loadTasks() {
        try {
            const data = await api("/api/tasks");

            if (!Array.isArray(data)) {
                throw new Error(
                    "Invalid task data received from Flask."
                );
            }

            tasks = data.map(task => ({
                ...task,
                id: Number(task.id),
                title: String(task.title),
                completed:
                    task.completed === true ||
                    task.completed === 1 ||
                    task.completed === "true"
            }));

            renderTasks();
            return true;
        } catch (error) {
            console.error("Could not load tasks:", error);
            showMessage(error.message, true);
            return false;
        }
    }

    // Add a new task
    form.addEventListener("submit", async event => {
        event.preventDefault();

        console.log("Add Task form submitted.");

        const title = input.value.trim();

        if (!title) {
            showMessage("Please enter a task first.", true);
            input.focus();
            return;
        }

        if (title.length > 200) {
            showMessage(
                "Task must be 200 characters or fewer.",
                true
            );
            return;
        }

        addButton.disabled = true;
        showMessage();

        try {
            await api("/api/tasks", {
                method: "POST",
                body: JSON.stringify({ title })
            });

            input.value = "";

            const loaded = await loadTasks();

            if (loaded) {
                showMessage("Task added successfully!");
            }

            input.focus();
        } catch (error) {
            console.error("Could not add task:", error);
            showMessage(error.message, true);
        } finally {
            addButton.disabled = false;
        }
    });

    // All / Pending / Completed filters
    filters.forEach(button => {
        button.addEventListener("click", () => {
            console.log("Filter clicked:", button.dataset.filter);

            const selectedFilter = button.dataset.filter;

            if (!["all", "pending", "completed"].includes(selectedFilter)) {
                console.error(
                    "Invalid filter:",
                    selectedFilter
                );
                return;
            }

            currentFilter = selectedFilter;

            filters.forEach(filter => {
                const active = filter === button;

                filter.classList.toggle("active", active);
                filter.setAttribute(
                    "aria-pressed",
                    String(active)
                );
            });

            renderTasks();
        });
    });

    // Initial page load
    loadTasks();
});
