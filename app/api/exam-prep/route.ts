import { streamTextWithFallback } from '@/lib/ai/config';

export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const mistakes = body.mistakes || [];

    const promptText = `
      这是学生在某学科目前收录的错题内容及他们的错误原因：
      ${JSON.stringify(mistakes.slice(0, 15), null, 2)}
      
      请根据以上学生的错题和知识薄弱点，为该学生生成一份专属的【在线测试卷】。
      试卷应该包含：
      1. 核心概念回顾（这部分不用太多字数）。
      2. 针对性练习题（与错题相似或变式的题目，避免出原题，至少出5道）。
      3. 答案解析附在最后，方便学生检测后核对并进行后期反馈。
      
      请用 Markdown 格式输出。
    `;

    const result = await streamTextWithFallback({
      tier: 'smart',
      system: "你是一位金牌导师。请根据学生的错题集，智能出题组成试卷，以便于学生在线练习或打印输出。",
      prompt: promptText
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error('[Exam Prep API] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
}
