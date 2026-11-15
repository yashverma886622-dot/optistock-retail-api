import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/db.ts';
import { User } from '../models/User.ts';
import { Category } from '../models/Category.ts';
import { Supplier } from '../models/Supplier.ts';
import { Product } from '../models/Product.ts';
import { Sale } from '../models/Sale.ts';
import { SaleItem } from '../models/SaleItem.ts';
import { InventoryTransaction } from '../models/InventoryTransaction.ts';
import { PurchaseOrder } from '../models/PurchaseOrder.ts';
import { PurchaseOrderItem } from '../models/PurchaseOrderItem.ts';
import { DemandForecast } from '../models/DemandForecast.ts';
import { SeasonalEvent } from '../models/SeasonalEvent.ts';
import { ReorderRecommendation } from '../models/ReorderRecommendation.ts';
import { Notification } from '../models/Notification.ts';
import { generateDemandForecast } from '../services/forecastingService.ts';
import { calculateInventoryOptimization } from '../services/optimizationService.ts';
import { syncSystemNotifications } from '../services/notificationService.ts';

const CATEGORIES = [
  { name: 'Groceries & Staples', slug: 'groceries-staples', description: 'Atta, rice, dals, pulses, and daily grains', targetTurnoverDays: 18 },
  { name: 'Cooking Oils & Ghee', slug: 'cooking-oils-ghee', description: 'Refined oils, mustard oil, and pure cow ghee', targetTurnoverDays: 22 },
  { name: 'Spices & Masalas', slug: 'spices-masalas', description: 'Whole spices, blended masalas, and seasonings', targetTurnoverDays: 35 },
  { name: 'Beverages & Tea', slug: 'beverages-tea', description: 'Assam tea, filter coffee, health drinks, and juices', targetTurnoverDays: 25 },
  { name: 'Dairy & Bakery', slug: 'dairy-bakery', description: 'UHT milk, paneer, butter, bread, and rusks', targetTurnoverDays: 10 },
  { name: 'Snacks & Confectionery', slug: 'snacks-confectionery', description: 'Namkeen, biscuits, chocolates, and instant noodles', targetTurnoverDays: 20 },
  { name: 'Personal Care', slug: 'personal-care', description: 'Soaps, shampoos, oral care, and skincare', targetTurnoverDays: 30 },
  { name: 'Home & Cleaning', slug: 'home-cleaning', description: 'Detergents, dishwash liquids, and floor cleaners', targetTurnoverDays: 32 },
  { name: 'Festive & Gift Hampers', slug: 'festive-gift-hampers', description: 'Dry fruit boxes, mithai tins, diyas, and gift packs', targetTurnoverDays: 40 },
  { name: 'Health & Wellness', slug: 'health-wellness', description: 'Chyawanprash, honey, oats, and herbal supplements', targetTurnoverDays: 35 },
];

const SUPPLIERS = [
  { name: 'Shree Ganesh Agro Distributors', code: 'SUP-SGAD', contactPerson: 'Rajeshwari Kulkarni', phone: '+91 98204 51201', email: 'orders@sgagro.in', address: 'Plot 14, APMC Market Yard, Vashi', city: 'Navi Mumbai', state: 'Maharashtra', gstin: '27AABCS1429B1Z5', averageLeadTimeDays: 4, leadTimeStdDevDays: 1, paymentTerms: 'Net 15', status: 'Active' as const, rating: 4.7 },
  { name: 'Bharat FMCG Supply Chain Pvt Ltd', code: 'SUP-BFMC', contactPerson: 'Vikramaditya Nair', phone: '+91 98451 22310', email: 'dispatch@bharatfmcg.co.in', address: '88 Industrial Estate, Peenya', city: 'Bengaluru', state: 'Karnataka', gstin: '29AAACB4920M1Z2', averageLeadTimeDays: 5, leadTimeStdDevDays: 1.2, paymentTerms: 'Net 30', status: 'Active' as const, rating: 4.5 },
  { name: 'Anand Dairy & Cold Chain Co.', code: 'SUP-ADCC', contactPerson: 'Hitesh Patel', phone: '+91 98250 77812', email: 'supply@anandcoldchain.in', address: 'NH-8 Dairy Logistics Park', city: 'Anand', state: 'Gujarat', gstin: '24AAACA3891P1Z8', averageLeadTimeDays: 2, leadTimeStdDevDays: 0.5, paymentTerms: 'Net 7', status: 'Active' as const, rating: 4.8 },
  { name: 'Malabar Spice & Tea Traders', code: 'SUP-MSTT', contactPerson: 'Meenakshi Menon', phone: '+91 98470 33491', email: 'trade@malabarspices.in', address: '22 Spice Bazaar Road, Mattancherry', city: 'Kochi', state: 'Kerala', gstin: '32AABCM9912K1Z1', averageLeadTimeDays: 7, leadTimeStdDevDays: 1.5, paymentTerms: 'Net 30', status: 'Active' as const, rating: 4.6 },
  { name: 'Narmada Edible Oils & Mills', code: 'SUP-NEOM', contactPerson: 'Sandeep Tiwari', phone: '+91 98260 66120', email: 'b2b@narmadaoils.in', address: 'Sector C, Sanwer Road Industrial Area', city: 'Indore', state: 'Madhya Pradesh', gstin: '23AAACN7731Q1Z9', averageLeadTimeDays: 6, leadTimeStdDevDays: 1.2, paymentTerms: 'Net 21', status: 'Active' as const, rating: 4.4 },
  { name: 'Capital Hygiene & Personal Care', code: 'SUP-CHPC', contactPerson: 'Ananya Verma', phone: '+91 98111 45098', email: 'accounts@capitalhygiene.in', address: 'B-42 Okhla Industrial Phase II', city: 'New Delhi', state: 'Delhi', gstin: '07AAACC5120R1Z4', averageLeadTimeDays: 5, leadTimeStdDevDays: 1, paymentTerms: 'Net 30', status: 'Active' as const, rating: 4.3 },
  { name: 'Jaipur Royal Dry Fruits & Gifting', code: 'SUP-JRDF', contactPerson: 'Mahendra Singhania', phone: '+91 98290 88741', email: 'wholesale@jaipurroyalgifts.in', address: '19 Johari Mandi Complex', city: 'Jaipur', state: 'Rajasthan', gstin: '08AABCJ6412D1Z7', averageLeadTimeDays: 6, leadTimeStdDevDays: 1.5, paymentTerms: 'Net 15', status: 'Active' as const, rating: 4.6 },
  { name: 'Deccan Beverages & Foods', code: 'SUP-DBAF', contactPerson: 'Karthik Reddy', phone: '+91 98490 19822', email: 'sales@deccanbeverages.in', address: 'Plot 7, Uppal Logistics Hub', city: 'Hyderabad', state: 'Telangana', gstin: '36AAACD8810F1Z3', averageLeadTimeDays: 4, leadTimeStdDevDays: 1, paymentTerms: 'Net 30', status: 'Active' as const, rating: 4.5 },
  { name: 'Bengal Heritage Confectionery', code: 'SUP-BHCF', contactPerson: 'Subhajit Chatterjee', phone: '+91 98301 55219', email: 'orders@bengalheritage.in', address: '104 Dankuni Food Park', city: 'Kolkata', state: 'West Bengal', gstin: '19AABCB2231L1Z6', averageLeadTimeDays: 7, leadTimeStdDevDays: 2, paymentTerms: 'Net 30', status: 'Active' as const, rating: 4.2 },
  { name: 'AyurLife Wellness Formulations', code: 'SUP-ALWF', contactPerson: 'Dr. Kavita Deshmukh', phone: '+91 98220 34115', email: 'retail@ayurlife.in', address: 'MIDC Chakan Phase II', city: 'Pune', state: 'Maharashtra', gstin: '27AAACA9081H1Z0', averageLeadTimeDays: 6, leadTimeStdDevDays: 1, paymentTerms: 'Net 30', status: 'Active' as const, rating: 4.7 },
  { name: 'Surat Textile & Home Care Agency', code: 'SUP-STHC', contactPerson: 'Nikhil Desai', phone: '+91 98251 99012', email: 'supply@surathomecare.in', address: 'Ring Road Trade Centre', city: 'Surat', state: 'Gujarat', gstin: '24AABCS3312E1Z2', averageLeadTimeDays: 5, leadTimeStdDevDays: 1.3, paymentTerms: 'Net 45', status: 'Active' as const, rating: 4.1 },
  { name: 'Coromandel Instant Foods', code: 'SUP-CIFD', contactPerson: 'Prakash Iyer', phone: '+91 98400 71234', email: 'b2b@coromandelfoods.in', address: 'Ambattur Industrial Estate', city: 'Chennai', state: 'Tamil Nadu', gstin: '33AAACC7741N1Z8', averageLeadTimeDays: 5, leadTimeStdDevDays: 1, paymentTerms: 'Net 30', status: 'Active' as const, rating: 4.4 },
];

interface SeedProductDef {
  name: string;
  sku: string;
  catSlug: string;
  supCode: string;
  brand: string;
  unit: string;
  cost: number;
  sell: number;
  gst: number;
  stock: number;
  min: number;
  max: number;
  reorder: number;
  lead: number;
  avgDaily: number;
  moq: number;
  expiryDays?: number;
}

const PRODUCTS: SeedProductDef[] = [
  // Groceries & Staples (6)
  { name: 'Aashirvaad Shudh Chakki Atta 10kg', sku: 'GRC-ATT-10', catSlug: 'groceries-staples', supCode: 'SUP-SGAD', brand: 'Aashirvaad', unit: 'bag', cost: 365, sell: 445, gst: 5, stock: 34, min: 20, max: 180, reorder: 45, lead: 4, avgDaily: 7.5, moq: 25 },
  { name: 'India Gate Basmati Rice Classic 5kg', sku: 'GRC-RIC-05', catSlug: 'groceries-staples', supCode: 'SUP-SGAD', brand: 'India Gate', unit: 'bag', cost: 480, sell: 595, gst: 5, stock: 18, min: 15, max: 140, reorder: 35, lead: 4, avgDaily: 5.2, moq: 20 },
  { name: 'Tata Sampann Unpolished Toor Dal 1kg', sku: 'GRC-DAL-01', catSlug: 'groceries-staples', supCode: 'SUP-SGAD', brand: 'Tata Sampann', unit: 'pack', cost: 142, sell: 178, gst: 5, stock: 85, min: 25, max: 220, reorder: 50, lead: 4, avgDaily: 8.4, moq: 30 },
  { name: 'Fortune Chakki Fresh Atta 5kg', sku: 'GRC-FAT-05', catSlug: 'groceries-staples', supCode: 'SUP-BFMC', brand: 'Fortune', unit: 'bag', cost: 190, sell: 235, gst: 5, stock: 112, min: 20, max: 180, reorder: 40, lead: 5, avgDaily: 6.1, moq: 25 },
  { name: 'Tata Salt Vacuum Evaporated 1kg', sku: 'GRC-SLT-01', catSlug: 'groceries-staples', supCode: 'SUP-BFMC', brand: 'Tata Salt', unit: 'pack', cost: 21, sell: 28, gst: 0, stock: 240, min: 60, max: 400, reorder: 90, lead: 5, avgDaily: 14.0, moq: 50 },
  { name: '24 Mantra Organic Moong Dal 1kg', sku: 'GRC-MNG-01', catSlug: 'groceries-staples', supCode: 'SUP-SGAD', brand: '24 Mantra', unit: 'pack', cost: 155, sell: 195, gst: 5, stock: 0, min: 15, max: 120, reorder: 30, lead: 4, avgDaily: 4.0, moq: 20 },

  // Cooking Oils & Ghee (5)
  { name: 'Fortune Sunlite Refined Sunflower Oil 1L', sku: 'OIL-SUN-01', catSlug: 'cooking-oils-ghee', supCode: 'SUP-NEOM', brand: 'Fortune', unit: 'pouch', cost: 124, sell: 152, gst: 5, stock: 28, min: 30, max: 250, reorder: 65, lead: 6, avgDaily: 9.2, moq: 40 },
  { name: 'Saffola Gold Blended Edible Oil 5L Jar', sku: 'OIL-SAF-05', catSlug: 'cooking-oils-ghee', supCode: 'SUP-NEOM', brand: 'Saffola', unit: 'jar', cost: 740, sell: 899, gst: 5, stock: 42, min: 15, max: 110, reorder: 30, lead: 6, avgDaily: 3.1, moq: 15 },
  { name: 'Amul Pure Cow Ghee 1L Tin', sku: 'OIL-GHE-01', catSlug: 'cooking-oils-ghee', supCode: 'SUP-ADCC', brand: 'Amul', unit: 'tin', cost: 545, sell: 640, gst: 12, stock: 12, min: 15, max: 100, reorder: 28, lead: 2, avgDaily: 4.5, moq: 15, expiryDays: 45 },
  { name: 'Dhara Kachi Ghani Mustard Oil 1L', sku: 'OIL-MUS-01', catSlug: 'cooking-oils-ghee', supCode: 'SUP-NEOM', brand: 'Dhara', unit: 'bottle', cost: 145, sell: 179, gst: 5, stock: 74, min: 20, max: 160, reorder: 42, lead: 6, avgDaily: 4.8, moq: 24 },
  { name: 'Patanjali Cow Ghee 500ml Jar', sku: 'OIL-PTG-05', catSlug: 'cooking-oils-ghee', supCode: 'SUP-ALWF', brand: 'Patanjali', unit: 'jar', cost: 285, sell: 345, gst: 12, stock: 138, min: 15, max: 100, reorder: 25, lead: 6, avgDaily: 2.2, moq: 12 },

  // Spices & Masalas (5)
  { name: 'MDH Deggi Mirch Chilli Powder 100g', sku: 'SPC-MDH-10', catSlug: 'spices-masalas', supCode: 'SUP-MSTT', brand: 'MDH', unit: 'box', cost: 68, sell: 88, gst: 5, stock: 95, min: 25, max: 200, reorder: 50, lead: 7, avgDaily: 5.5, moq: 30 },
  { name: 'Everest Garam Masala 100g', sku: 'SPC-EVG-10', catSlug: 'spices-masalas', supCode: 'SUP-MSTT', brand: 'Everest', unit: 'box', cost: 72, sell: 92, gst: 5, stock: 22, min: 20, max: 180, reorder: 45, lead: 7, avgDaily: 5.0, moq: 30 },
  { name: 'Catch Turmeric Haldi Powder 200g', sku: 'SPC-CTH-20', catSlug: 'spices-masalas', supCode: 'SUP-MSTT', brand: 'Catch', unit: 'pack', cost: 52, sell: 68, gst: 5, stock: 110, min: 25, max: 180, reorder: 40, lead: 7, avgDaily: 3.9, moq: 25 },
  { name: 'Tata Sampann Paneer Masala 45g', sku: 'SPC-TSP-45', catSlug: 'spices-masalas', supCode: 'SUP-BFMC', brand: 'Tata Sampann', unit: 'pack', cost: 28, sell: 38, gst: 5, stock: 165, min: 30, max: 220, reorder: 55, lead: 5, avgDaily: 6.3, moq: 40 },
  { name: 'Malabar Whole Black Pepper 250g', sku: 'SPC-MBP-25', catSlug: 'spices-masalas', supCode: 'SUP-MSTT', brand: 'Malabar Gold', unit: 'pouch', cost: 195, sell: 250, gst: 5, stock: 9, min: 10, max: 80, reorder: 20, lead: 7, avgDaily: 1.8, moq: 15 },

  // Beverages & Tea (6)
  { name: 'Tata Tea Gold Assam Leaf 500g', sku: 'BEV-TTG-50', catSlug: 'beverages-tea', supCode: 'SUP-DBAF', brand: 'Tata Tea', unit: 'pack', cost: 225, sell: 280, gst: 5, stock: 31, min: 20, max: 180, reorder: 48, lead: 4, avgDaily: 6.8, moq: 25 },
  { name: 'Brooke Bond Red Label Tea 1kg', sku: 'BEV-RDL-1K', catSlug: 'beverages-tea', supCode: 'SUP-DBAF', brand: 'Brooke Bond', unit: 'pack', cost: 430, sell: 525, gst: 5, stock: 64, min: 18, max: 150, reorder: 35, lead: 4, avgDaily: 4.3, moq: 20 },
  { name: 'Nescafe Classic Instant Coffee 190g Jar', sku: 'BEV-NSC-19', catSlug: 'beverages-tea', supCode: 'SUP-DBAF', brand: 'Nescafe', unit: 'jar', cost: 410, sell: 499, gst: 18, stock: 14, min: 12, max: 90, reorder: 25, lead: 4, avgDaily: 2.9, moq: 15 },
  { name: 'Bru Gold Freeze Dried Coffee 100g', sku: 'BEV-BRU-10', catSlug: 'beverages-tea', supCode: 'SUP-DBAF', brand: 'Bru', unit: 'jar', cost: 215, sell: 265, gst: 18, stock: 54, min: 15, max: 110, reorder: 28, lead: 4, avgDaily: 2.5, moq: 15 },
  { name: 'Real Fruit Power Mango Juice 1L', sku: 'BEV-RLM-1L', catSlug: 'beverages-tea', supCode: 'SUP-DBAF', brand: 'Real', unit: 'tetra', cost: 92, sell: 120, gst: 12, stock: 88, min: 25, max: 200, reorder: 45, lead: 4, avgDaily: 5.8, moq: 24, expiryDays: 24 },
  { name: 'Bournvita Health Drink 500g Jar', sku: 'BEV-BRN-50', catSlug: 'beverages-tea', supCode: 'SUP-BFMC', brand: 'Cadbury', unit: 'jar', cost: 198, sell: 245, gst: 18, stock: 46, min: 15, max: 120, reorder: 30, lead: 5, avgDaily: 3.2, moq: 18 },

  // Dairy & Bakery (6)
  { name: 'Amul Taaza Toned UHT Milk 1L', sku: 'DRY-TZA-1L', catSlug: 'dairy-bakery', supCode: 'SUP-ADCC', brand: 'Amul', unit: 'tetra', cost: 58, sell: 72, gst: 0, stock: 36, min: 40, max: 300, reorder: 80, lead: 2, avgDaily: 18.0, moq: 48, expiryDays: 18 },
  { name: 'Amul Pasteurised Butter 500g', sku: 'DRY-BTR-50', catSlug: 'dairy-bakery', supCode: 'SUP-ADCC', brand: 'Amul', unit: 'pack', cost: 235, sell: 285, gst: 12, stock: 19, min: 20, max: 150, reorder: 40, lead: 2, avgDaily: 7.4, moq: 25, expiryDays: 21 },
  { name: 'Mother Dairy Fresh Paneer 200g', sku: 'DRY-PNR-20', catSlug: 'dairy-bakery', supCode: 'SUP-ADCC', brand: 'Mother Dairy', unit: 'pack', cost: 72, sell: 92, gst: 5, stock: 14, min: 18, max: 120, reorder: 35, lead: 2, avgDaily: 8.5, moq: 24, expiryDays: 9 },
  { name: 'Britannia Cheese Slices 200g', sku: 'DRY-CHS-20', catSlug: 'dairy-bakery', supCode: 'SUP-ADCC', brand: 'Britannia', unit: 'pack', cost: 118, sell: 145, gst: 12, stock: 58, min: 15, max: 120, reorder: 30, lead: 2, avgDaily: 4.1, moq: 20, expiryDays: 26 },
  { name: 'Britannia Toastea Premium Bake Rusk 400g', sku: 'DRY-RSK-40', catSlug: 'dairy-bakery', supCode: 'SUP-CIFD', brand: 'Britannia', unit: 'pack', cost: 54, sell: 70, gst: 5, stock: 94, min: 20, max: 160, reorder: 40, lead: 5, avgDaily: 5.6, moq: 24, expiryDays: 60 },
  { name: 'Amul Masti Dahi Cup 400g', sku: 'DRY-DHI-40', catSlug: 'dairy-bakery', supCode: 'SUP-ADCC', brand: 'Amul', unit: 'cup', cost: 34, sell: 45, gst: 5, stock: 0, min: 20, max: 120, reorder: 35, lead: 2, avgDaily: 7.2, moq: 24, expiryDays: 10 },

  // Snacks & Confectionery (6)
  { name: 'Maggi 2-Minute Masala Noodles 560g (8-Pack)', sku: 'SNK-MGI-08', catSlug: 'snacks-confectionery', supCode: 'SUP-CIFD', brand: 'Maggi', unit: 'pack', cost: 88, sell: 112, gst: 18, stock: 124, min: 30, max: 260, reorder: 65, lead: 5, avgDaily: 11.2, moq: 40 },
  { name: 'Haldiram Aloo Bhujia 400g', sku: 'SNK-HLD-40', catSlug: 'snacks-confectionery', supCode: 'SUP-BHCF', brand: 'Haldiram', unit: 'pack', cost: 82, sell: 105, gst: 12, stock: 41, min: 25, max: 200, reorder: 55, lead: 7, avgDaily: 7.5, moq: 30 },
  { name: 'Britannia Good Day Cashew 600g', sku: 'SNK-GDD-60', catSlug: 'snacks-confectionery', supCode: 'SUP-CIFD', brand: 'Britannia', unit: 'pack', cost: 96, sell: 125, gst: 18, stock: 145, min: 25, max: 130, reorder: 40, lead: 5, avgDaily: 5.8, moq: 25 },
  { name: 'Parle-G Gold Biscuits 1kg Family Pack', sku: 'SNK-PRG-1K', catSlug: 'snacks-confectionery', supCode: 'SUP-BFMC', brand: 'Parle', unit: 'pack', cost: 98, sell: 125, gst: 18, stock: 88, min: 25, max: 200, reorder: 50, lead: 5, avgDaily: 6.4, moq: 30 },
  { name: 'Cadbury Dairy Milk Silk Roast Almond 143g', sku: 'SNK-CDM-14', catSlug: 'snacks-confectionery', supCode: 'SUP-BHCF', brand: 'Cadbury', unit: 'bar', cost: 142, sell: 180, gst: 18, stock: 22, min: 20, max: 160, reorder: 40, lead: 7, avgDaily: 5.1, moq: 25 },
  { name: 'Lays India Magic Masala 90g', sku: 'SNK-LAY-90', catSlug: 'snacks-confectionery', supCode: 'SUP-CIFD', brand: 'Lays', unit: 'pack', cost: 38, sell: 50, gst: 12, stock: 170, min: 40, max: 300, reorder: 75, lead: 5, avgDaily: 12.5, moq: 50 },

  // Personal Care (5)
  { name: 'Dove Cream Beauty Bathing Bar (4x100g)', sku: 'PRC-DOV-04', catSlug: 'personal-care', supCode: 'SUP-CHPC', brand: 'Dove', unit: 'pack', cost: 195, sell: 249, gst: 18, stock: 48, min: 15, max: 140, reorder: 30, lead: 5, avgDaily: 3.8, moq: 20 },
  { name: 'Colgate Strong Teeth Toothpaste 500g', sku: 'PRC-CLG-50', catSlug: 'personal-care', supCode: 'SUP-CHPC', brand: 'Colgate', unit: 'tube', cost: 210, sell: 265, gst: 18, stock: 24, min: 20, max: 150, reorder: 40, lead: 5, avgDaily: 4.9, moq: 24 },
  { name: 'Head & Shoulders Cool Menthol 650ml', sku: 'PRC-HAS-65', catSlug: 'personal-care', supCode: 'SUP-CHPC', brand: 'Head & Shoulders', unit: 'bottle', cost: 430, sell: 549, gst: 18, stock: 16, min: 12, max: 90, reorder: 25, lead: 5, avgDaily: 2.3, moq: 12 },
  { name: 'Dettol Original Germ Protection Handwash 750ml', sku: 'PRC-DET-75', catSlug: 'personal-care', supCode: 'SUP-CHPC', brand: 'Dettol', unit: 'pouch', cost: 145, sell: 189, gst: 18, stock: 79, min: 20, max: 150, reorder: 35, lead: 5, avgDaily: 4.4, moq: 20 },
  { name: 'Parachute 100% Pure Coconut Oil 600ml', sku: 'PRC-PAR-60', catSlug: 'personal-care', supCode: 'SUP-BFMC', brand: 'Parachute', unit: 'bottle', cost: 215, sell: 270, gst: 18, stock: 62, min: 18, max: 140, reorder: 32, lead: 5, avgDaily: 3.6, moq: 20 },

  // Home & Cleaning (5)
  { name: 'Surf Excel Matic Front Load Detergent 2L', sku: 'HOM-SRF-02', catSlug: 'home-cleaning', supCode: 'SUP-STHC', brand: 'Surf Excel', unit: 'bottle', cost: 345, sell: 430, gst: 18, stock: 29, min: 15, max: 130, reorder: 35, lead: 5, avgDaily: 3.7, moq: 18 },
  { name: 'Vim Dishwash Gel Lemon 750ml', sku: 'HOM-VIM-75', catSlug: 'home-cleaning', supCode: 'SUP-STHC', brand: 'Vim', unit: 'bottle', cost: 148, sell: 189, gst: 18, stock: 84, min: 20, max: 180, reorder: 42, lead: 5, avgDaily: 5.5, moq: 24 },
  { name: 'Lizol Disinfectant Surface Cleaner 2L', sku: 'HOM-LIZ-02', catSlug: 'home-cleaning', supCode: 'SUP-STHC', brand: 'Lizol', unit: 'bottle', cost: 280, sell: 355, gst: 18, stock: 51, min: 15, max: 130, reorder: 30, lead: 5, avgDaily: 3.2, moq: 18 },
  { name: 'Harpic Power Plus Toilet Cleaner 1L', sku: 'HOM-HRP-01', catSlug: 'home-cleaning', supCode: 'SUP-CHPC', brand: 'Harpic', unit: 'bottle', cost: 156, sell: 199, gst: 18, stock: 12, min: 18, max: 140, reorder: 35, lead: 5, avgDaily: 4.2, moq: 20 },
  { name: 'Ariel Complete Detergent Powder 4kg', sku: 'HOM-ARL-04', catSlug: 'home-cleaning', supCode: 'SUP-STHC', brand: 'Ariel', unit: 'pack', cost: 520, sell: 649, gst: 18, stock: 112, min: 12, max: 90, reorder: 24, lead: 5, avgDaily: 1.9, moq: 12 },

  // Festive & Gift Hampers (6)
  { name: 'Royal Diwali Dry Fruit Assorted Box 500g', sku: 'FST-DRF-50', catSlug: 'festive-gift-hampers', supCode: 'SUP-JRDF', brand: 'Jaipur Royal', unit: 'box', cost: 520, sell: 699, gst: 12, stock: 18, min: 20, max: 160, reorder: 40, lead: 6, avgDaily: 3.5, moq: 20 },
  { name: 'Haldiram Gulab Jamun Tin 1kg', sku: 'FST-GLJ-1K', catSlug: 'festive-gift-hampers', supCode: 'SUP-BHCF', brand: 'Haldiram', unit: 'tin', cost: 195, sell: 260, gst: 5, stock: 45, min: 20, max: 180, reorder: 40, lead: 7, avgDaily: 3.8, moq: 24 },
  { name: 'Haldiram Soan Papdi Festive Pack 500g', sku: 'FST-SNP-50', catSlug: 'festive-gift-hampers', supCode: 'SUP-BHCF', brand: 'Haldiram', unit: 'box', cost: 115, sell: 155, gst: 5, stock: 155, min: 25, max: 120, reorder: 45, lead: 7, avgDaily: 4.1, moq: 30 },
  { name: 'Cadbury Celebrations Rich Dry Fruit 177g', sku: 'FST-CCB-17', catSlug: 'festive-gift-hampers', supCode: 'SUP-BHCF', brand: 'Cadbury', unit: 'box', cost: 280, sell: 350, gst: 18, stock: 26, min: 20, max: 150, reorder: 38, lead: 7, avgDaily: 3.4, moq: 20 },
  { name: 'Kaju Katli Heritage Gift Tin 400g', sku: 'FST-KJK-40', catSlug: 'festive-gift-hampers', supCode: 'SUP-JRDF', brand: 'Jaipur Royal', unit: 'tin', cost: 380, sell: 495, gst: 5, stock: 8, min: 15, max: 110, reorder: 30, lead: 6, avgDaily: 2.9, moq: 15, expiryDays: 28 },
  { name: 'California Roasted Almonds Pouch 500g', sku: 'FST-ALM-50', catSlug: 'festive-gift-hampers', supCode: 'SUP-JRDF', brand: 'Nutraj', unit: 'pouch', cost: 430, sell: 550, gst: 12, stock: 62, min: 15, max: 120, reorder: 28, lead: 6, avgDaily: 2.6, moq: 15 },

  // Health & Wellness (5)
  { name: 'Dabur Chyawanprash Awaleha 1kg', sku: 'HLT-CHY-1K', catSlug: 'health-wellness', supCode: 'SUP-ALWF', brand: 'Dabur', unit: 'jar', cost: 315, sell: 395, gst: 12, stock: 38, min: 15, max: 130, reorder: 32, lead: 6, avgDaily: 3.1, moq: 15 },
  { name: 'Dabur 100% Pure Honey 500g', sku: 'HLT-HNY-50', catSlug: 'health-wellness', supCode: 'SUP-ALWF', brand: 'Dabur', unit: 'bottle', cost: 185, sell: 235, gst: 0, stock: 74, min: 20, max: 150, reorder: 35, lead: 6, avgDaily: 3.8, moq: 20 },
  { name: 'Quaker Rolled Oats Family Pack 1.5kg', sku: 'HLT-OAT-15', catSlug: 'health-wellness', supCode: 'SUP-BFMC', brand: 'Quaker', unit: 'pack', cost: 225, sell: 285, gst: 5, stock: 58, min: 15, max: 140, reorder: 30, lead: 5, avgDaily: 3.4, moq: 18 },
  { name: 'Organic India Tulsi Green Tea 25 Bags', sku: 'HLT-TGT-25', catSlug: 'health-wellness', supCode: 'SUP-ALWF', brand: 'Organic India', unit: 'box', cost: 155, sell: 199, gst: 5, stock: 11, min: 12, max: 90, reorder: 24, lead: 6, avgDaily: 2.2, moq: 15 },
  { name: 'Saffola Masala Oats Classic 500g', sku: 'HLT-MSO-50', catSlug: 'health-wellness', supCode: 'SUP-ALWF', brand: 'Saffola', unit: 'pack', cost: 148, sell: 190, gst: 12, stock: 69, min: 15, max: 130, reorder: 28, lead: 6, avgDaily: 2.7, moq: 18 },
];

// Deterministic PRNG for reproducible, realistic 90-day Indian retail sales patterns
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function runSeed(options: { forceReset?: boolean } = {}) {
  const health = await connectDatabase();
  if (!health.connected) {
    throw new Error(`Cannot seed database: ${health.message}`);
  }

  const [existingProducts, existingUsers] = await Promise.all([
    Product.countDocuments(),
    User.countDocuments(),
  ]);
  if ((existingProducts > 0 || existingUsers > 0) && !options.forceReset) {
    return {
      success: false,
      skipped: true,
      databaseName: mongoose.connection.name,
      message: `Seed skipped: database "${mongoose.connection.name}" already contains ${existingUsers} user(s) and ${existingProducts} product(s). Use Admin reset if you intend to rebuild demo data.`,
    };
  }

  if (options.forceReset) {
    await Promise.all([
      User.deleteMany({}),
      Category.deleteMany({}),
      Supplier.deleteMany({}),
      Product.deleteMany({}),
      Sale.deleteMany({}),
      SaleItem.deleteMany({}),
      InventoryTransaction.deleteMany({}),
      PurchaseOrder.deleteMany({}),
      PurchaseOrderItem.deleteMany({}),
      DemandForecast.deleteMany({}),
      SeasonalEvent.deleteMany({}),
      ReorderRecommendation.deleteMany({}),
      Notification.deleteMany({}),
    ]);
  }

  // 1. Create Demo Users
  const [adminHash, managerHash, staffHash] = await Promise.all([
    bcrypt.hash('Admin@123', 10),
    bcrypt.hash('Manager@123', 10),
    bcrypt.hash('Staff@123', 10),
  ]);

  const users = await User.insertMany([
    {
      name: 'Arjun Deshmukh',
      email: 'admin@optistock.in',
      passwordHash: adminHash,
      role: 'Admin',
      phone: '+91 98200 10001',
      storeLocation: 'Mumbai Flagship Supermart',
    },
    {
      name: 'Priya Subramanian',
      email: 'manager@optistock.in',
      passwordHash: managerHash,
      role: 'Manager',
      phone: '+91 98200 10002',
      storeLocation: 'Mumbai Flagship Supermart',
    },
    {
      name: 'Rohan Sharma',
      email: 'staff@optistock.in',
      passwordHash: staffHash,
      role: 'Staff',
      phone: '+91 98200 10003',
      storeLocation: 'Mumbai Flagship Supermart',
    },
  ]);
  const adminUser = users[0];

  // 2. Create Categories & Suppliers
  const categories = await Category.insertMany(
    CATEGORIES.map((c) => ({ ...c, isDemoData: true }))
  );
  const catBySlug = new Map(categories.map((c) => [c.slug, c]));

  const suppliers = await Supplier.insertMany(
    SUPPLIERS.map((s) => ({ ...s, isDemoData: true }))
  );
  const supByCode = new Map(suppliers.map((s) => [s.code, s]));

  // 3. Create 55 Products
  const now = new Date();
  const productDocs = PRODUCTS.map((p, idx) => {
    const cat = catBySlug.get(p.catSlug)!;
    const sup = supByCode.get(p.supCode)!;
    return {
      name: p.name,
      sku: p.sku,
      barcode: `890${String(1000000000 + idx)}`,
      description: `Demo retail SKU for ${p.brand} (${p.name})`,
      category: cat._id,
      brand: p.brand,
      unit: p.unit,
      costPrice: p.cost,
      sellingPrice: p.sell,
      gstRate: p.gst,
      currentStock: p.stock,
      minStock: p.min,
      maxStock: p.max,
      reorderLevel: p.reorder,
      supplier: sup._id,
      leadTimeDays: p.lead,
      expiryDate: p.expiryDays ? new Date(now.getTime() + p.expiryDays * 86400000) : null,
      orderingCost: 500,
      holdingCostRate: 0.2,
      serviceLevel: 95,
      minOrderQuantity: p.moq,
      isDemoData: true,
      isActive: true,
    };
  });

  const products = await Product.insertMany(productDocs);
  const prodBySku = new Map(products.map((p) => [p.sku, p]));

  // 4. Seasonal Events (Indian Retail Calendar)
  const year = now.getFullYear();
  const makeDate = (daysOffset: number) => new Date(now.getTime() + daysOffset * 86400000);
  const festiveCat = catBySlug.get('festive-gift-hampers')!._id;
  const snacksCat = catBySlug.get('snacks-confectionery')!._id;
  const oilsCat = catBySlug.get('cooking-oils-ghee')!._id;
  const dairyCat = catBySlug.get('dairy-bakery')!._id;
  const spicesCat = catBySlug.get('spices-masalas')!._id;

  const seasonalEvents = await SeasonalEvent.insertMany([
    {
      name: 'Diwali Mega Festive Season',
      code: `DIWALI-${year}`,
      startDate: makeDate(-35),
      endDate: makeDate(-20),
      demandMultiplier: 1.85,
      affectedCategories: [festiveCat, snacksCat, oilsCat],
      description: 'Peak Indian festive demand for dry fruit hampers, sweets, ghee, and snacks.',
      year,
      isRecurring: true,
      isActive: true,
      isDemoData: true,
    },
    {
      name: 'Christmas & Winter Holiday Week',
      code: `CHRISTMAS-${year}`,
      startDate: makeDate(35),
      endDate: makeDate(43),
      demandMultiplier: 1.45,
      affectedCategories: [snacksCat, festiveCat, dairyCat],
      description: 'Year-end gifting, chocolates, bakery, and beverage surge.',
      year,
      isRecurring: true,
      isActive: true,
      isDemoData: true,
    },
    {
      name: 'New Year Celebration Week',
      code: `NEWYEAR-${year + 1}`,
      startDate: makeDate(44),
      endDate: makeDate(51),
      demandMultiplier: 1.4,
      affectedCategories: [snacksCat, catBySlug.get('beverages-tea')!._id],
      description: 'New Year party snacks, juices, and beverage demand.',
      year: year + 1,
      isRecurring: true,
      isActive: true,
      isDemoData: true,
    },
    {
      name: 'Holi Color & Festive Demand',
      code: `HOLI-${year + 1}`,
      startDate: makeDate(110),
      endDate: makeDate(118),
      demandMultiplier: 1.55,
      affectedCategories: [snacksCat, festiveCat, oilsCat],
      description: 'Namkeen, sweets, festive beverages, and cooking oil spike.',
      year: year + 1,
      isRecurring: true,
      isActive: true,
      isDemoData: true,
    },
    {
      name: 'Eid-ul-Fitr Festive Peak',
      code: `EID-${year + 1}`,
      startDate: makeDate(125),
      endDate: makeDate(132),
      demandMultiplier: 1.6,
      affectedCategories: [spicesCat, festiveCat, oilsCat, dairyCat],
      description: 'High demand for vermicelli, dry fruits, ghee, and whole spices.',
      year: year + 1,
      isRecurring: true,
      isActive: true,
      isDemoData: true,
    },
    {
      name: 'Raksha Bandhan Gifting Window',
      code: `RAKHI-${year + 1}`,
      startDate: makeDate(250),
      endDate: makeDate(257),
      demandMultiplier: 1.5,
      affectedCategories: [festiveCat, snacksCat],
      description: 'Chocolate gift packs, mithai tins, and dry fruit hampers.',
      year: year + 1,
      isRecurring: true,
      isActive: true,
      isDemoData: true,
    },
    {
      name: 'Navratri & Dussehra Fasting & Feast',
      code: `NAVRATRI-${year}`,
      startDate: makeDate(-60),
      endDate: makeDate(-50),
      demandMultiplier: 1.4,
      affectedCategories: [catBySlug.get('groceries-staples')!._id, dairyCat, festiveCat],
      description: 'Nine-day festive demand for dairy, dry fruits, and staples.',
      year,
      isRecurring: true,
      isActive: true,
      isDemoData: true,
    },
  ]);

  // 5. Generate 90 days of logical historical Sales + SaleItems + InventoryTransactions
  const rand = mulberry32(20261115);
  const paymentMethods = ['UPI', 'UPI', 'Card', 'Cash', 'NetBanking'] as const;
  const customerPool = [
    'Walk-in Customer',
    'Siddharth Joshi',
    'Neha Kulkarni',
    'Amitabh Roy',
    'Kavita Iyer',
    'Deepak Agarwal',
    'Sneha Nair',
    'Rajat Malhotra',
  ];

  const saleDocs = [];
  const saleItemDocs = [];
  const txDocs = [];
  const productObsMap = new Map<string, Array<{ date: string; quantity: number }>>();

  let invoiceCounter = 1001;
  for (let dayOffset = 89; dayOffset >= 0; dayOffset--) {
    const saleDay = new Date(now.getTime() - dayOffset * 86400000);
    const isoDate = saleDay.toISOString().slice(0, 10);
    const dow = saleDay.getUTCDay();
    const isWeekend = dow === 0 || dow === 6;
    // Simulate historical Diwali uplift in days -35..-20 and mild growth trend
    const inDiwaliWindow = dayOffset >= 20 && dayOffset <= 35;
    const inNavratriWindow = dayOffset >= 50 && dayOffset <= 60;
    const trendFactor = 0.92 + ((90 - dayOffset) / 90) * 0.18;
    const dayMult = (isWeekend ? 1.28 : 0.94) * (inDiwaliWindow ? 1.65 : inNavratriWindow ? 1.25 : 1.0) * trendFactor;

    // Create 3-5 consolidated daily POS invoices to represent realistic store throughput
    const ordersToday = isWeekend ? 5 : 3;
    const dailyBuckets: Array<Array<{ prod: typeof products[0]; qty: number }>> = Array.from(
      { length: ordersToday },
      () => []
    );

    for (const def of PRODUCTS) {
      const prod = prodBySku.get(def.sku)!;
      const expected = def.avgDaily * dayMult;
      const noise = 0.65 + rand() * 0.7;
      const qtyToday = Math.max(0, Math.round(expected * noise));

      if (qtyToday > 0) {
        const pid = String(prod._id);
        const obsList = productObsMap.get(pid) || [];
        obsList.push({ date: isoDate, quantity: qtyToday });
        productObsMap.set(pid, obsList);

        // Distribute qtyToday across 1 or 2 invoices
        const bucketIdx = Math.floor(rand() * ordersToday);
        dailyBuckets[bucketIdx].push({ prod, qty: qtyToday });
      }
    }

    for (let b = 0; b < dailyBuckets.length; b++) {
      const lines = dailyBuckets[b];
      if (lines.length === 0) continue;

      let subtotal = 0;
      let gstAmount = 0;
      for (const l of lines) {
        const net = l.prod.sellingPrice * l.qty;
        const gst = (net * l.prod.gstRate) / 100;
        subtotal += net;
        gstAmount += gst;
      }

      const invoiceNumber = `INV-${isoDate.replace(/-/g, '')}-${invoiceCounter++}`;
      const saleDate = new Date(`${isoDate}T${String(10 + b * 2).padStart(2, '0')}:15:00.000Z`);
      const totalAmount = Number((subtotal + gstAmount).toFixed(2));

      const saleDoc = {
        invoiceNumber,
        customerName: customerPool[(invoiceCounter + b) % customerPool.length],
        paymentMethod: paymentMethods[(invoiceCounter + b) % paymentMethods.length],
        subtotal: Number(subtotal.toFixed(2)),
        discountAmount: 0,
        gstAmount: Number(gstAmount.toFixed(2)),
        totalAmount,
        paymentStatus: 'Paid' as const,
        cashier: adminUser._id,
        saleDate,
        isDemoData: true,
        _tempLines: lines,
      };
      saleDocs.push(saleDoc);
    }
  }

  const insertedSales = await Sale.insertMany(
    saleDocs.map(({ _tempLines, ...rest }) => rest)
  );

  for (let i = 0; i < insertedSales.length; i++) {
    const sale = insertedSales[i];
    const lines = saleDocs[i]._tempLines;
    for (const l of lines) {
      const net = l.prod.sellingPrice * l.qty;
      const gst = Number(((net * l.prod.gstRate) / 100).toFixed(2));
      saleItemDocs.push({
        sale: sale._id,
        product: l.prod._id,
        sku: l.prod.sku,
        productName: l.prod.name,
        quantity: l.qty,
        unitPrice: l.prod.sellingPrice,
        costPrice: l.prod.costPrice,
        discountPercent: 0,
        gstRate: l.prod.gstRate,
        gstAmount: gst,
        lineTotal: Number((net + gst).toFixed(2)),
        saleDate: sale.saleDate,
        isDemoData: true,
      });

      // Log recent 21 days of inventory transactions so the ledger stays crisp and fast
      if (sale.saleDate >= makeDate(-21)) {
        txDocs.push({
          product: l.prod._id,
          type: 'SALE',
          quantityChange: -l.qty,
          previousStock: l.prod.currentStock + l.qty,
          newStock: l.prod.currentStock,
          unitCost: l.prod.costPrice,
          referenceType: 'Sale',
          referenceId: sale.invoiceNumber,
          reason: `Demo POS Sale ${sale.invoiceNumber}`,
          performedBy: adminUser._id,
          transactionDate: sale.saleDate,
          isDemoData: true,
        });
      }
    }
  }

  await SaleItem.insertMany(saleItemDocs);
  if (txDocs.length > 0) {
    await InventoryTransaction.insertMany(txDocs);
  }

  // 6. Seed Purchase Orders across workflow statuses
  const poSpecs = [
    { supplier: supByCode.get('SUP-SGAD')!, status: 'Received' as const, daysAgo: 20, dueOffset: -16, skus: ['GRC-ATT-10', 'GRC-RIC-05'] },
    { supplier: supByCode.get('SUP-ADCC')!, status: 'Partially Received' as const, daysAgo: 3, dueOffset: -1, skus: ['DRY-TZA-1L', 'DRY-BTR-50'] },
    { supplier: supByCode.get('SUP-NEOM')!, status: 'Ordered' as const, daysAgo: 4, dueOffset: 2, skus: ['OIL-SUN-01', 'OIL-MUS-01'] },
    { supplier: supByCode.get('SUP-CHPC')!, status: 'Approved' as const, daysAgo: 2, dueOffset: 3, skus: ['PRC-CLG-50', 'HOM-HRP-01'] },
    { supplier: supByCode.get('SUP-JRDF')!, status: 'Pending Approval' as const, daysAgo: 1, dueOffset: 5, skus: ['FST-DRF-50', 'FST-KJK-40'] },
    { supplier: supByCode.get('SUP-MSTT')!, status: 'Draft' as const, daysAgo: 0, dueOffset: 7, skus: ['SPC-EVG-10', 'SPC-MBP-25'] },
  ];

  let poInsertedCount = 0;
  let poItemsInsertedCount = 0;
  for (let idx = 0; idx < poSpecs.length; idx++) {
    const spec = poSpecs[idx];
    let subtotal = 0;
    let gstAmount = 0;
    const items = spec.skus.map((sku) => {
      const p = prodBySku.get(sku)!;
      const orderedQty = p.minOrderQuantity * 2;
      const receivedQty =
        spec.status === 'Received' ? orderedQty : spec.status === 'Partially Received' ? Math.floor(orderedQty / 2) : 0;
      const net = orderedQty * p.costPrice;
      const gst = Number(((net * p.gstRate) / 100).toFixed(2));
      subtotal += net;
      gstAmount += gst;
      return {
        product: p._id,
        sku: p.sku,
        productName: p.name,
        orderedQuantity: orderedQty,
        receivedQuantity: receivedQty,
        unitCost: p.costPrice,
        gstRate: p.gstRate,
        lineTotal: Number((net + gst).toFixed(2)),
      };
    });

    const po = await PurchaseOrder.create({
      poNumber: `PO-DEMO-${202600 + idx}`,
      supplier: spec.supplier._id,
      status: spec.status,
      orderDate: makeDate(-spec.daysAgo),
      expectedDeliveryDate: makeDate(spec.dueOffset),
      receivedDate: spec.status === 'Received' ? makeDate(spec.dueOffset) : undefined,
      subtotal: Number(subtotal.toFixed(2)),
      gstAmount: Number(gstAmount.toFixed(2)),
      totalAmount: Number((subtotal + gstAmount).toFixed(2)),
      notes: 'Seeded demonstration purchase order',
      createdBy: adminUser._id,
      approvedBy: ['Received', 'Partially Received', 'Ordered', 'Approved'].includes(spec.status) ? adminUser._id : undefined,
      isDemoData: true,
    });

    await PurchaseOrderItem.insertMany(items.map((it) => ({ ...it, purchaseOrder: po._id })));
    poInsertedCount += 1;
    poItemsInsertedCount += items.length;
  }

  // 7. Generate initial Reorder Recommendations from actual seeded sales & stock
  const recsToInsert = [];
  for (const p of products) {
    const obs = productObsMap.get(String(p._id)) || [];
    const forecast = generateDemandForecast({
      observations: obs,
      horizonDays: 30,
      method: 'TREND_SEASONAL',
      lookbackDays: 90,
    });
    const opt = calculateInventoryOptimization({
      currentStock: p.currentStock,
      avgDailyDemand: forecast.avgDailyHistorical,
      demandStdDev: forecast.demandStdDev,
      leadTimeDays: p.leadTimeDays,
      leadTimeStdDevDays: 1,
      serviceLevelPct: p.serviceLevel,
      unitCost: p.costPrice,
      orderingCost: p.orderingCost,
      holdingCostRate: p.holdingCostRate,
      minOrderQuantity: p.minOrderQuantity,
      maxStock: p.maxStock,
    });
    if (opt.needsReorder && opt.recommendedOrderQty > 0) {
      recsToInsert.push({
        product: p._id,
        supplier: p.supplier,
        currentStock: p.currentStock,
        avgDailyDemand: forecast.avgDailyHistorical,
        demandStdDev: forecast.demandStdDev,
        forecastedDemand30d: forecast.forecastTotal,
        safetyStock: opt.safetyStock,
        reorderPoint: opt.reorderPoint,
        eoq: opt.eoq,
        recommendedOrderQty: opt.recommendedOrderQty,
        estimatedOrderCost: opt.estimatedOrderCost,
        leadTimeDays: p.leadTimeDays,
        serviceLevel: opt.serviceLevelPct,
        stockoutRiskPct: opt.stockoutRiskPct,
        urgency: opt.urgency,
        status: 'Pending',
        formulaBreakdown: opt.formulaBreakdown,
        generatedAt: new Date(),
      });
    }
  }
  if (recsToInsert.length > 0) {
    await ReorderRecommendation.insertMany(recsToInsert);
  }

  await syncSystemNotifications();
  const notificationsCount = await Notification.countDocuments();

  const summary = {
    users: users.length,
    categories: categories.length,
    suppliers: suppliers.length,
    products: products.length,
    seasonalEvents: seasonalEvents.length,
    sales: insertedSales.length,
    saleItems: saleItemDocs.length,
    inventoryTransactions: txDocs.length,
    purchaseOrders: poInsertedCount,
    purchaseOrderItems: poItemsInsertedCount,
    recommendations: recsToInsert.length,
    notifications: notificationsCount,
  };

  const totalInserted = Object.values(summary).reduce((acc, n) => acc + n, 0);

  return {
    success: true,
    skipped: false,
    databaseName: mongoose.connection.name,
    totalInserted,
    message: `Successfully inserted ${totalInserted} records into MongoDB Atlas database "${mongoose.connection.name}" (${summary.products} products, ${summary.categories} categories, ${summary.suppliers} suppliers, ${summary.sales} sales, ${summary.saleItems} sale items, ${summary.inventoryTransactions} transactions, ${summary.purchaseOrders} POs, ${summary.seasonalEvents} seasonal events, ${summary.recommendations} recommendations, ${summary.notifications} notifications, ${summary.users} users).`,
    summary,
  };
}

// Allow running directly via `npm run seed`
const isDirectRun = process.argv[1] && process.argv[1].includes('seedData');
if (isDirectRun) {
  runSeed({ forceReset: process.argv.includes('--reset') })
    .then((result) => {
      console.log('[Seed Completed]', JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Seed Error]', err);
      process.exit(1);
    });
}
