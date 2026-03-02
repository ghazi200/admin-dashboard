// Debug script to check policy documents and chunks
// Usage: Run from abe-guard-ai/backend directory
//   node DEBUG_POLICY_QUERY.js [guard-email]

require("dotenv").config();
const { sequelize } = require("./src/config/db");

async function debugPolicy() {
  try {
    await sequelize.authenticate();
    console.log("✅ Database connected\n");

    // Get all tenants
    const [tenants] = await sequelize.query(
      `SELECT id, name FROM tenants LIMIT 10`
    );
    console.log("📋 Tenants in database:");
    if (tenants.length === 0) {
      console.log("  ❌ NO TENANTS FOUND");
      console.log("  💡 You need to create a tenant first");
    } else {
      tenants.forEach((t, i) => console.log(`  ${i + 1}. ${t.name || t.id} (ID: ${t.id})`));
    }
    console.log();

    // Get all guards with tenant_id
    const [guards] = await sequelize.query(
      `SELECT id, email, name, tenant_id FROM guards LIMIT 10`
    );
    console.log("👥 Guards with tenant_id:");
    guards.forEach((g, i) => {
      console.log(`  ${i + 1}. ${g.email} (${g.name || 'N/A'})`);
      console.log(`     Guard ID: ${g.id}`);
      console.log(`     Tenant ID: ${g.tenant_id || '❌ MISSING'}`);
    });
    console.log();

    // Get all policy documents
    const [docs] = await sequelize.query(
      `SELECT id, tenant_id, site_id, title, category, visibility, is_active, 
              LENGTH(raw_text) as text_length, 
              (SELECT COUNT(*) FROM policy_chunks WHERE document_id = policy_documents.id) as chunk_count
       FROM policy_documents
       ORDER BY created_at DESC
       LIMIT 20`
    );
    console.log("📄 Policy Documents:");
    if (docs.length === 0) {
      console.log("  ❌ NO POLICY DOCUMENTS FOUND");
      console.log("  💡 Upload a policy document via Admin Dashboard → Ask Policy page");
    } else {
      docs.forEach((d, i) => {
        console.log(`  ${i + 1}. "${d.title}"`);
        console.log(`     Document ID: ${d.id}`);
        console.log(`     Tenant ID: ${d.tenant_id || 'NULL'}`);
        console.log(`     Site ID: ${d.site_id || 'NULL (tenant-wide)'}`);
        console.log(`     Category: ${d.category || 'N/A'}`);
        console.log(`     Visibility: ${d.visibility}`);
        console.log(`     Active: ${d.is_active ? '✅ YES' : '❌ NO'}`);
        console.log(`     Text length: ${d.text_length || 0} chars`);
        console.log(`     Chunks: ${d.chunk_count || 0}`);
        if (!d.is_active) {
          console.log(`     ⚠️  DOCUMENT IS INACTIVE - guards won't see it`);
        }
        if (!d.text_length || d.text_length < 20) {
          console.log(`     ⚠️  NO TEXT CONTENT - needs extraction or text upload`);
        }
        if (!d.chunk_count || d.chunk_count === 0) {
          console.log(`     ⚠️  NO CHUNKS - needs reindexing`);
        }
        console.log();
      });
    }

    // Get all policy chunks
    const [chunks] = await sequelize.query(
      `SELECT COUNT(*) as total, 
              COUNT(DISTINCT document_id) as document_count,
              COUNT(DISTINCT tenant_id) as tenant_count
       FROM policy_chunks`
    );
    console.log("🧩 Policy Chunks Summary:");
    console.log(`  Total chunks: ${chunks[0].total || 0}`);
    console.log(`  Documents with chunks: ${chunks[0].document_count || 0}`);
    console.log(`  Unique tenants: ${chunks[0].tenant_count || 0}`);
    console.log();

    // Check embeddings
    let embedCheck = [{ total_chunks: 0, chunks_with_embedding: 0, chunks_with_json: 0 }];
    try {
      [embedCheck] = await sequelize.query(
        `SELECT 
          COUNT(*) as total_chunks,
          COUNT(embedding) as chunks_with_embedding,
          COUNT(CASE WHEN embedding_json IS NOT NULL THEN 1 END) as chunks_with_json
         FROM policy_chunks`
      );
    } catch (e) {
      // Column might not exist, that's okay
      const [basic] = await sequelize.query(`SELECT COUNT(*) as total_chunks FROM policy_chunks`);
      embedCheck = [{ total_chunks: basic[0].total_chunks || 0, chunks_with_embedding: 0, chunks_with_json: 0 }];
    }
    console.log("🔮 Embeddings Status:");
    console.log(`  Total chunks: ${embedCheck[0].total_chunks || 0}`);
    console.log(`  With pgvector embedding: ${embedCheck[0].chunks_with_embedding || 0}`);
    console.log(`  With JSON embedding: ${embedCheck[0].chunks_with_json || 0}`);
    if (embedCheck[0].chunks_with_embedding === 0 && embedCheck[0].chunks_with_json === 0 && embedCheck[0].total_chunks > 0) {
      console.log(`  ⚠️  NO EMBEDDINGS - vector search won't work (will use keyword search)`);
      console.log(`  💡 Set OPENAI_API_KEY to enable embeddings`);
    }
    console.log();

    // Check a specific guard's tenant (if provided)
    if (process.argv[2]) {
      const guardEmail = process.argv[2];
      const [guardRows] = await sequelize.query(
        `SELECT id, email, tenant_id FROM guards WHERE email = $1 LIMIT 1`,
        { bind: [guardEmail] }
      );
      if (guardRows.length > 0) {
        const guard = guardRows[0];
        console.log(`🔍 Checking guard: ${guardEmail}`);
        console.log(`   Guard ID: ${guard.id}`);
        console.log(`   Tenant ID: ${guard.tenant_id || '❌ MISSING'}`);
        if (guard.tenant_id) {
          const [tenantDocs] = await sequelize.query(
            `SELECT id, title, is_active, visibility,
                    (SELECT COUNT(*) FROM policy_chunks WHERE document_id = policy_documents.id) as chunk_count
             FROM policy_documents
             WHERE tenant_id = $1
             ORDER BY created_at DESC`,
            { bind: [guard.tenant_id] }
          );
          console.log(`   Documents for this tenant: ${tenantDocs.length}`);
          tenantDocs.forEach((d, i) => {
            console.log(`     ${i + 1}. "${d.title}" - Active: ${d.is_active ? '✅' : '❌'}, Chunks: ${d.chunk_count || 0}, Visibility: ${d.visibility}`);
          });
        } else {
          console.log(`   ❌ Guard has no tenant_id assigned!`);
          console.log(`   💡 Assign a tenant_id to this guard in the database`);
        }
      } else {
        console.log(`   ❌ Guard not found: ${guardEmail}`);
      }
    }

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error);
    if (sequelize) await sequelize.close();
    process.exit(1);
  }
}

debugPolicy();
