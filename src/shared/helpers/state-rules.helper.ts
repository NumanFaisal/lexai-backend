import { ComplianceChecklistItem } from "@/ai/pipelines/compliance.pipeline"; 

type StateRulesMap = Record<string, ComplianceChecklistItem[]>;

export const stateComplianceRules: StateRulesMap = {
  'Maharashtra': [
    {
      category: 'STATE_SPECIFIC',
      priority: 'URGENT',
      title: 'Maharashtra Professional Tax (PTEC/PTRC)',
      law: 'Maharashtra State Tax on Professions, Trades, Callings and Employments Act, 1975',
      requirement: 'Register and deduct professional tax from employees earning above threshold.',
      deadline: 'Monthly (last date of the month)',
      penalty: 'Interest at 1.25% per month + penalty up to 10% of tax due',
      action: 'Register for PTRC/PTEC on the MahGST portal'
    },
    {
      category: 'STATE_SPECIFIC',
      priority: 'THIS_QUARTER',
      title: 'Maharashtra Shops and Establishments (Gumasta)',
      law: 'Maharashtra Shops and Establishments Act, 2017',
      requirement: 'Obtain Gumasta license for premises with 10 or more workers.',
      deadline: 'Within 60 days of commencing business',
      penalty: 'Fines extending up to ₹1,00,000',
      action: 'File Form A/B on Aaple Sarkar portal'
    }
  ],
  'Karnataka': [
    {
      category: 'STATE_SPECIFIC',
      priority: 'URGENT',
      title: 'Karnataka Professional Tax',
      law: 'Karnataka Tax on Professions, Trades, Callings and Employments Act, 1976',
      requirement: 'Deduct and remit ₹200/month for employees earning >₹15,000.',
      deadline: '20th of every month',
      penalty: 'Penalty equal to the tax amount + 1.25% interest per month',
      action: 'Register on e-Prerana portal'
    }
  ],
  'Tamil Nadu': [
    {
      category: 'STATE_SPECIFIC',
      priority: 'URGENT',
      title: 'Tamil Nadu Professional Tax (Chennai)',
      law: 'Town Panchayats/Municipalities Rules, 1988',
      requirement: 'Deduct PT based on salary slab for employees in Greater Chennai.',
      deadline: 'March 31 (half-yearly)',
      penalty: 'Penalty up to 100% of tax due + interest',
      action: 'Register and pay via Tamil Nadu Municipal Administration portal'
    }
  ],
  'Gujarat': [
    {
      category: 'STATE_SPECIFIC',
      priority: 'URGENT',
      title: 'Gujarat Professional Tax',
      law: 'Gujarat Profession Tax Act, 1976',
      requirement: 'Deduct PT for employees earning above ₹6,000/month.',
      deadline: 'Monthly',
      penalty: 'Interest at 2% per month + penalty',
      action: 'Register on Gujarat Commercial Tax portal'
    }
  ],
  'Telangana': [
    {
      category: 'STATE_SPECIFIC',
      priority: 'URGENT',
      title: 'Telangana Professional Tax',
      law: 'Telangana State Tax on Professions, Trades, Callings and Employments Act, 1987',
      requirement: 'Deduct ₹150-₹200/month for employees earning >₹15,000.',
      deadline: 'Monthly',
      penalty: 'Penalty up to 50% of tax due + interest',
      action: 'Register on Telangana Commercial Taxes portal (tgct.gov.in)'
    }
  ],
  'West Bengal': [
    {
      category: 'STATE_SPECIFIC',
      priority: 'URGENT',
      title: 'West Bengal Professional Tax',
      law: 'West Bengal State Tax on Professions, Trades, Callings and Employments Act, 1979',
      requirement: 'Deduct PT for employees earning above ₹10,000/month.',
      deadline: 'Monthly',
      penalty: 'Penalty up to 100% of tax due',
      action: 'Register on West Bengal Profession Tax portal (professiontax.wb.gov.in)'
    }
  ],
  'Andhra Pradesh': [
    {
      category: 'STATE_SPECIFIC',
      priority: 'URGENT',
      title: 'Andhra Pradesh Professional Tax',
      law: 'Andhra Pradesh Tax on Professions, Trades, Callings and Employments Act, 1987',
      requirement: 'Deduct ₹150-₹200/month for employees earning >₹15,000.',
      deadline: 'Monthly',
      penalty: 'Penalty up to 50% of tax due + interest',
      action: 'Register on AP Commercial Taxes portal'
    }
  ],
  'Madhya Pradesh': [
    {
      category: 'STATE_SPECIFIC',
      priority: 'URGENT',
      title: 'Madhya Pradesh Professional Tax',
      law: 'Madhya Pradesh Profession Tax Act',
      requirement: 'Deduct PT for employees earning above ₹18,750/month.',
      deadline: '10th of every month',
      penalty: 'Interest at 1.5% per month + penalty',
      action: 'Register on MP Commercial Tax portal'
    }
  ],
  'Punjab': [
    {
      category: 'STATE_SPECIFIC',
      priority: 'URGENT',
      title: 'Punjab Professional Tax',
      law: 'Punjab Profession Tax Act',
      requirement: 'Deduct ₹175-₹200/month for employees earning above ₹7,500.',
      deadline: 'Monthly',
      penalty: 'Penalty up to 100% of tax due',
      action: 'Register on Punjab Revenue Authority portal'
    }
  ],
  'Bihar': [
    {
      category: 'STATE_SPECIFIC',
      priority: 'THIS_QUARTER',
      title: 'Bihar Professional Tax',
      law: 'Bihar Tax on Professions, Trades, Callings and Employments Act, 2011',
      requirement: 'Pay annual PT for employees earning above ₹25,000/month.',
      deadline: 'Annually (June 30)',
      penalty: 'Interest at 1% per month + penalty',
      action: 'Register on Bihar Commercial Tax portal'
    }
  ],
  'Odisha': [
    {
      category: 'STATE_SPECIFIC',
      priority: 'THIS_QUARTER',
      title: 'Odisha Professional Tax',
      law: 'Orissa State Tax on Professions, Trades, Callings and Employments Act, 2000',
      requirement: 'Deduct ₹125-₹200/month for employees earning above ₹13,305.',
      deadline: 'June 30 (annually)',
      penalty: 'Penalty equal to tax amount + interest',
      action: 'Register on Odisha Commercial Tax portal'
    }
  ],
  'Assam': [
    {
      category: 'STATE_SPECIFIC',
      priority: 'URGENT',
      title: 'Assam Professional Tax',
      law: 'Assam Professions Taxation Act, 1947',
      requirement: 'Deduct ₹180-₹208/month for employees earning above ₹15,000.',
      deadline: 'Monthly',
      penalty: 'Penalty up to 50% of tax due',
      action: 'Register on Assam Comtax portal (comtax.assam.gov.in)'
    }
  ],
  'Kerala': [
    {
      category: 'STATE_SPECIFIC',
      priority: 'THIS_QUARTER',
      title: 'Kerala Professional Tax',
      law: 'Kerala State Tax on Professions, Trades, Callings & Employment Rules, 1996',
      requirement: 'Pay half-yearly PT for employees earning above ₹12,000.',
      deadline: 'August 31 / February 28 (half-yearly)',
      penalty: 'Interest at 1% per month + penalty',
      action: 'Register on Kerala Panchayat Raj portal'
    }
  ],
  'Jharkhand': [
    {
      category: 'STATE_SPECIFIC',
      priority: 'URGENT',
      title: 'Jharkhand Professional Tax',
      law: 'Jharkhand State Tax on Professions, Trades, Callings and Employments Act',
      requirement: 'Deduct PT for employees earning above applicable threshold.',
      deadline: 'Monthly',
      penalty: 'Interest + penalty as per state rules',
      action: 'Register on Jharkhand Commercial Tax portal'
    }
  ],
  'Himachal Pradesh': [
    {
      category: 'STATE_SPECIFIC',
      priority: 'NOT_APPLICABLE',
      title: 'No Professional Tax in Himachal Pradesh',
      law: 'N/A',
      requirement: 'No professional tax levied in this state.',
      deadline: 'N/A',
      penalty: 'N/A',
      action: 'No registration required'
    }
  ],
  'Rajasthan': [
    {
      category: 'STATE_SPECIFIC',
      priority: 'NOT_APPLICABLE',
      title: 'No Professional Tax in Rajasthan',
      law: 'N/A',
      requirement: 'No professional tax levied in this state.',
      deadline: 'N/A',
      penalty: 'N/A',
      action: 'No registration required'
    }
  ],
  'Uttar Pradesh': [
    {
      category: 'STATE_SPECIFIC',
      priority: 'NOT_APPLICABLE',
      title: 'No Professional Tax in Uttar Pradesh',
      law: 'N/A',
      requirement: 'No professional tax levied in this state.',
      deadline: 'N/A',
      penalty: 'N/A',
      action: 'No registration required'
    }
  ],
  'Uttarakhand': [
    {
      category: 'STATE_SPECIFIC',
      priority: 'NOT_APPLICABLE',
      title: 'No Professional Tax in Uttarakhand',
      law: 'N/A',
      requirement: 'No professional tax levied in this state.',
      deadline: 'N/A',
      penalty: 'N/A',
      action: 'No registration required'
    }
  ],
  'Haryana': [
    {
      category: 'STATE_SPECIFIC',
      priority: 'NOT_APPLICABLE',
      title: 'No Professional Tax in Haryana',
      law: 'N/A',
      requirement: 'No professional tax levied in this state.',
      deadline: 'N/A',
      penalty: 'N/A',
      action: 'No registration required'
    }
  ],
  'Chhattisgarh': [
    {
      category: 'STATE_SPECIFIC',
      priority: 'NOT_APPLICABLE',
      title: 'No Professional Tax in Chhattisgarh',
      law: 'N/A',
      requirement: 'No professional tax levied in this state.',
      deadline: 'N/A',
      penalty: 'N/A',
      action: 'No registration required'
    }
  ],
  'Goa': [
    {
      category: 'STATE_SPECIFIC',
      priority: 'NOT_APPLICABLE',
      title: 'No Professional Tax in Goa',
      law: 'N/A',
      requirement: 'No professional tax levied in this state.',
      deadline: 'N/A',
      penalty: 'N/A',
      action: 'No registration required'
    }
  ],
  'Arunachal Pradesh': [
    {
      category: 'STATE_SPECIFIC',
      priority: 'NOT_APPLICABLE',
      title: 'No Professional Tax in Arunachal Pradesh',
      law: 'N/A',
      requirement: 'No professional tax levied in this state.',
      deadline: 'N/A',
      penalty: 'N/A',
      action: 'No registration required'
    }
  ],
  'Delhi': [
    {
      category: 'STATE_SPECIFIC',
      priority: 'NOT_APPLICABLE',
      title: 'No Professional Tax in Delhi',
      law: 'N/A',
      requirement: 'No professional tax levied in this state.',
      deadline: 'N/A',
      penalty: 'N/A',
      action: 'No registration required'
    }
  ],
  'Jammu and Kashmir': [
    {
      category: 'STATE_SPECIFIC',
      priority: 'NOT_APPLICABLE',
      title: 'No Professional Tax in Jammu and Kashmir',
      law: 'N/A',
      requirement: 'No professional tax levied in this state.',
      deadline: 'N/A',
      penalty: 'N/A',
      action: 'No registration required'
    }
  ],
  'Ladakh': [
    {
      category: 'STATE_SPECIFIC',
      priority: 'NOT_APPLICABLE',
      title: 'No Professional Tax in Ladakh',
      law: 'N/A',
      requirement: 'No professional tax levied in this state.',
      deadline: 'N/A',
      penalty: 'N/A',
      action: 'No registration required'
    }
  ],
  'Chandigarh': [
    {
      category: 'STATE_SPECIFIC',
      priority: 'NOT_APPLICABLE',
      title: 'No Professional Tax in Chandigarh',
      law: 'N/A',
      requirement: 'No professional tax levied in this UT.',
      deadline: 'N/A',
      penalty: 'N/A',
      action: 'No registration required'
    }
  ]
};

export const getStateSpecificRules = (stateName: string): ComplianceChecklistItem[] =>  {
  return stateComplianceRules[stateName] || [];
};
