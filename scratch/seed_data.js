import db from '../electron/db.js';

function seed() {
  console.log("Seeding data...");
  try {
    const product1 = {
      brand: "Brand A",
      generic_name: "Generic A",
      formulation: "Formulation A",
      size: "Size A",
      category: "Category A",
      markup: 10,
      packaging_type: "Box",
      description: "Test product 1",
      reorder_point: 5,
      is_active: 1
    };

    const newProduct1 = db.addProduct(product1);
    console.log("Added product:", newProduct1.id);

    db.addBatch({
      product_id: newProduct1.id,
      supplier_name: "Supplier X",
      supplier_price: 100,
      markup: 10,
      quantity: 50,
      expiration_date: "2027-01-01",
      batch_number: "B001",
      date: new Date().toISOString()
    });
    
    db.addBatch({
      product_id: newProduct1.id,
      supplier_name: "Supplier Y",
      supplier_price: 120, // New price
      markup: 10,
      quantity: 50,
      expiration_date: "2028-01-01",
      batch_number: "B002",
      date: new Date().toISOString()
    });

    console.log("Added batches for product 1");

  } catch (error) {
    console.error("Error seeding data:", error);
  }
}

seed();
console.log("Done.");
process.exit(0);
