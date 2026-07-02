import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { skill, payload } = await req.json()

    // 1. Получаем ключи (упадут, если не настроены)
    const llmApiKey = Deno.env.get('LLM_API_KEY');
    // Берем токен из окружения, либо используем хардкод (только для примера, лучше хранить в .env)
    const polzaMcpToken = Deno.env.get('POLZA_MCP_TOKEN') || 'polza_5fbaceb1a957097dd0a9a711b66343176c48343c0c08776463232c8b609f7df2';

    if (!llmApiKey) {
      return new Response(JSON.stringify({ 
        error: "LLM API ключ не настроен. Пожалуйста, добавьте LLM_API_KEY в Supabase Secrets.",
        action_required: true 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200, // Возвращаем 200, чтобы показать ошибку в UI красиво
      })
    }

    // Подготовка системного промпта в зависимости от навыка
    let systemPrompt = "Ты - опытный ИИ-помощник.";
    if (skill === 'prd-to-plan') {
      systemPrompt = "Ты - опытный менеджер проектов (Agile). Проанализируй текст и разбей его на конкретные задачи и этапы. Верни ответ в формате Markdown.";
    } else if (skill === 'brainstorming') {
      systemPrompt = "Ты - эксперт по стратегии. Предложи 3 альтернативных пути развития проекта на основе данных от пользователя.";
    } else if (skill === 'grill-me') {
      systemPrompt = "Ты - строгий ИИ-аудитор. Укажи на слабые места, потенциальные задержки и риски в предложенном плане.";
    } else if (skill === 'request-refactor-plan') {
      systemPrompt = "Ты - Senior Разработчик. Составь план рефакторинга и тестирования (TDD) для этой задачи.";
    }

    // Шаг 2. Запрос к LLM (например, OpenRouter, который поддерживает Qwen/KIMI/Claude)
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${llmApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "qwen/qwen-2.5-72b-instruct", // Пример отличной бесплатной модели через OpenRouter
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: payload || "Выполни анализ." }
        ]
      })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Ошибка LLM API: ${err}`);
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || "Не удалось получить ответ от нейросети.";

    // Возвращаем результат
    return new Response(JSON.stringify({ result: reply }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
