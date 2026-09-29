import fs from "node:fs";

const dataUrl = new URL("../data/questions.json", import.meta.url);
const questions = JSON.parse(fs.readFileSync(dataUrl, "utf8"));
const allowedDifficulties = new Set(["C", "B", "A", "S"]);
const requiredFields = ["id", "genre", "difficulty", "question", "answer"];
const errors = [];
const seen = new Map();
const seenIds = new Map();

if (!Array.isArray(questions)) {
  errors.push("ルートは配列にしてください");
} else {
  questions.forEach((question, index) => {
    const label = `${index + 1}問目`;
    for (const field of requiredFields) {
      if (typeof question[field] !== "string" || !question[field].trim()) {
        errors.push(`${label}: ${field} は空でない文字列にしてください`);
      }
    }
    if (!allowedDifficulties.has(question.difficulty)) {
      errors.push(`${label}: difficulty は C/B/A/S のいずれかにしてください`);
    }

    if (seenIds.has(question.id)) {
      errors.push(`${label}: ${seenIds.get(question.id)}問目と id が重複しています`);
    } else {
      seenIds.set(question.id, index + 1);
    }

    const key = `${question.question?.trim()}\u0000${question.answer?.trim()}`;
    if (seen.has(key)) {
      errors.push(`${label}: ${seen.get(key)}問目と問題文・答えが重複しています`);
    } else {
      seen.set(key, index + 1);
    }
  });
}

if (errors.length) {
  console.error(`問題データに ${errors.length} 件のエラーがあります`);
  errors.slice(0, 30).forEach(error => console.error(`- ${error}`));
  if (errors.length > 30) console.error(`- ほか ${errors.length - 30} 件`);
  process.exitCode = 1;
} else {
  const genres = new Set(questions.map(question => question.genre));
  console.log(`問題データ: ${questions.length}問 / ${genres.size}ジャンル / エラーなし`);
}
