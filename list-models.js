require('dotenv').config();

async function listModels() {
  const apiKey = process.env.KIMI_API_KEY;

  console.log('🔍 Đang lấy danh sách models từ OpenRouter...\n');

  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Lỗi:', data);
      return;
    }

    // Lọc các model có chứa "kimi" hoặc "moonshot"
    const kimiModels = data.data.filter(model =>
      model.id.toLowerCase().includes('kimi') ||
      model.id.toLowerCase().includes('moonshot')
    );

    if (kimiModels.length > 0) {
      console.log('✅ Tìm thấy các Kimi/Moonshot models:\n');
      kimiModels.forEach(model => {
        console.log(`📌 ${model.id}`);
        console.log(`   Tên: ${model.name}`);
        console.log(`   Context: ${model.context_length} tokens`);
        console.log(`   Giá: $${model.pricing?.prompt || 'N/A'}/1M prompt tokens\n`);
      });
    } else {
      console.log('⚠️  Không tìm thấy model Kimi/Moonshot cụ thể.');
      console.log('📋 Hiển thị 10 model đầu tiên:\n');
      data.data.slice(0, 10).forEach(model => {
        console.log(`   - ${model.id}`);
      });
    }

  } catch (error) {
    console.error('❌ Lỗi:', error.message);
  }
}

listModels();
