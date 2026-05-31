require('dotenv').config();

async function testKimiAPI() {
  const apiKey = process.env.KIMI_API_KEY;

  if (!apiKey) {
    console.error('❌ Không tìm thấy KIMI_API_KEY trong file .env');
    return;
  }

  console.log('🔑 API Key đã load:', apiKey.substring(0, 20) + '...');
  console.log('🚀 Đang test Kimi API qua OpenRouter...\n');

  // Danh sách các model Kimi có sẵn
  const kimiModels = [
    'moonshotai/kimi-k2.6:free',  // Free model
    '~moonshotai/kimi-latest',     // Latest model
    'moonshotai/kimi-k2.6',        // Paid model
    'moonshotai/kimi-k2-thinking'  // Thinking model
  ];

  const testModel = kimiModels[1]; // Dùng latest model

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3002',
        'X-Title': 'Kimi API Test'
      },
      body: JSON.stringify({
        model: testModel,
        messages: [
          {
            role: 'user',
            content: 'Xin chào! Hãy trả lời ngắn gọn: bạn là ai?'
          }
        ],
        max_tokens: 100  // Giới hạn để tiết kiệm credits
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Lỗi API:', response.status, response.statusText);
      console.error('Chi tiết:', JSON.stringify(data, null, 2));

      // Nếu model không tồn tại, gợi ý cách tìm model
      if (data.error?.code === 'model_not_found') {
        console.log('\n💡 Gợi ý: Model có thể không đúng. Thử lấy danh sách model:');
        console.log('   curl https://openrouter.ai/api/v1/models -H "Authorization: Bearer YOUR_KEY"');
      }
      return;
    }

    console.log('✅ API hoạt động thành công!\n');
    console.log('📝 Model:', testModel);
    console.log('💬 Phản hồi:', data.choices[0].message.content);
    console.log('\n📊 Thông tin sử dụng:');
    console.log('   - Prompt tokens:', data.usage?.prompt_tokens || 'N/A');
    console.log('   - Completion tokens:', data.usage?.completion_tokens || 'N/A');
    console.log('   - Total tokens:', data.usage?.total_tokens || 'N/A');

  } catch (error) {
    console.error('❌ Lỗi kết nối:', error.message);
    console.error('Chi tiết:', error);
  }
}

// Chạy test
testKimiAPI();
