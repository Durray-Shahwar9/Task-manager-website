
from flask import Flask, render_template, request, jsonify
import csv
from pathlib import Path

app = Flask(__name__)

# Keep the CSV file beside app.py
CSV_FILE = Path(__file__).resolve().parent / "tasks.csv"

FIELDS = ["id", "title", "completed"]


def initialize_csv():
    """Create the CSV file with headers if it doesn't exist."""
    if not CSV_FILE.exists():
        with CSV_FILE.open("w", newline="", encoding="utf-8") as file:
            writer = csv.DictWriter(file, fieldnames=FIELDS)
            writer.writeheader()


def read_tasks():
    initialize_csv()

    with CSV_FILE.open("r", newline="", encoding="utf-8") as file:
        reader = csv.DictReader(file)
        tasks = []

        for row in reader:
            tasks.append({
                "id": int(row["id"]),
                "title": row["title"],
                "completed": row["completed"].lower() == "true"
            })

    return tasks


def save_tasks(tasks):
    """Write all tasks back to the CSV file."""
    with CSV_FILE.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=FIELDS)
        writer.writeheader()

        for task in tasks:
            writer.writerow({
                "id": task["id"],
                "title": task["title"],
                "completed": str(task["completed"]).lower()
            })


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/api/tasks", methods=["GET"])
def get_tasks():
    try:
        return jsonify(read_tasks())
    except (OSError, ValueError, KeyError, csv.Error) as error:
        app.logger.exception("Could not read tasks.csv")
        return jsonify({"error": "Could not read tasks.csv."}), 500


@app.route("/api/tasks", methods=["POST"])
def add_task():
    data = request.get_json(silent=True) or {}
    title = data.get("title", "")

    if not isinstance(title, str) or not title.strip():
        return jsonify({"error": "Please enter a valid task."}), 400

    title = title.strip()

    if len(title) > 200:
        return jsonify({"error": "Task must be 200 characters or fewer."}), 400

    try:
        tasks = read_tasks()
        new_id = max((task["id"] for task in tasks), default=0) + 1

        task = {
            "id": new_id,
            "title": title,
            "completed": False
        }

        tasks.append(task)
        save_tasks(tasks)

        return jsonify(task), 201

    except (OSError, ValueError, KeyError, csv.Error):
        app.logger.exception("Could not save task")
        return jsonify({"error": "Could not save task to CSV."}), 500


@app.route("/api/tasks/<int:task_id>", methods=["PATCH"])
def update_task(task_id):
    data = request.get_json(silent=True) or {}
    completed = data.get("completed")

    if not isinstance(completed, bool):
        return jsonify({"error": "Invalid completion status."}), 400

    try:
        tasks = read_tasks()

        for task in tasks:
            if task["id"] == task_id:
                task["completed"] = completed
                save_tasks(tasks)
                return jsonify({"message": "Task updated."})

        return jsonify({"error": "Task not found."}), 404

    except (OSError, ValueError, KeyError, csv.Error):
        app.logger.exception("Could not update task")
        return jsonify({"error": "Could not update CSV file."}), 500


@app.route("/api/tasks/<int:task_id>", methods=["DELETE"])
def delete_task(task_id):
    try:
        tasks = read_tasks()
        remaining = [
            task for task in tasks if task["id"] != task_id
        ]

        if len(remaining) == len(tasks):
            return jsonify({"error": "Task not found."}), 404

        save_tasks(remaining)
        return jsonify({"message": "Task deleted."})

    except (OSError, ValueError, KeyError, csv.Error):
        app.logger.exception("Could not delete task")
        return jsonify({"error": "Could not update CSV file."}), 500


if __name__ == "__main__":
    initialize_csv()
    app.run(debug=True)
