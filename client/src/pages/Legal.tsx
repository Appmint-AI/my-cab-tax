import { Link, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CarFront, ArrowLeft, AlertTriangle, Shield, Crown } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Legal() {
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const defaultTab = params.get("tab") || "terms";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <nav className="border-b border-border/40 backdrop-blur-sm fixed w-full z-50 bg-background/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="bg-primary p-2 rounded-lg text-primary-foreground">
              <CarFront className="w-6 h-6" />
            </div>
            <span className="font-display font-bold text-xl tracking-tight">My Cab Tax</span>
          </div>
          <Link href="/">
            <Button variant="outline" data-testid="button-back-home">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to App
            </Button>
          </Link>
        </div>
      </nav>

      <main className="pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto flex-1 w-full">
        <h1 className="font-display font-bold text-3xl sm:text-4xl mb-2" data-testid="text-legal-title">Legal Center - My Cab Tax USA</h1>
        <p className="text-sm text-muted-foreground mb-6" data-testid="text-legal-last-updated">Last Updated: February 11, 2026 &mdash; Version 1.0</p>

        <Card className="p-6 sm:p-8 mb-8 border-destructive/50 bg-destructive/5" data-testid="disclaimer-box">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-destructive shrink-0 mt-0.5" />
            <div>
              <h2 className="font-display font-bold text-lg mb-2 text-destructive">IMPORTANT: TAX DISCLAIMER</h2>
              <p className="text-sm leading-relaxed text-foreground/90">
                <strong>My Cab Tax USA is a bookkeeping tool, NOT a tax advisory service.</strong> We do not provide professional tax, legal, or accounting advice. This software is designed for informational and organizational purposes only. You should consult with a qualified CPA or Tax Attorney before submitting any returns to the IRS.
              </p>
            </div>
          </div>
        </Card>

        <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList className="w-full grid grid-cols-4 mb-8">
            <TabsTrigger value="terms" data-testid="tab-terms">Terms</TabsTrigger>
            <TabsTrigger value="privacy" data-testid="tab-privacy">Privacy</TabsTrigger>
            <TabsTrigger value="tax" data-testid="tab-tax">Tax</TabsTrigger>
            <TabsTrigger value="subscriptions" data-testid="tab-subscriptions">Subscriptions</TabsTrigger>
          </TabsList>

          <TabsContent value="terms">
            <Card className="p-6 sm:p-8">
              <h2 className="font-display font-bold text-2xl mb-4">1. Terms of Service</h2>
              <p className="text-sm text-muted-foreground mb-6">Last updated: February 2026</p>

              <div className="space-y-6 text-sm leading-relaxed text-foreground/90">
                <section>
                  <h3 className="font-semibold text-base mb-2">1.1 Acceptance of Terms</h3>
                  <p>By accessing or using My Cab Tax USA ("the Service"), you agree to be bound by these Terms of Service. If you do not agree, you may not use the Service. We reserve the right to update these Terms at any time, and continued use of the Service constitutes acceptance of any changes.</p>
                </section>

                <section>
                  <h3 className="font-semibold text-base mb-2">1.2 Description of Service</h3>
                  <p>My Cab Tax USA provides tax tracking and estimation tools for rideshare and taxi drivers in the United States. The Service allows users to log income, expenses, miles driven, and platform fees, and generates estimated tax calculations based on publicly available IRS rates. By using My Cab Tax USA, you agree that we are not liable for any IRS audits, penalties, or interest resulting from your use of this app. Accuracy of data entry is the sole responsibility of the driver.</p>
                </section>

                <section>
                  <h3 className="font-semibold text-base mb-2">1.3 User Accounts</h3>
                  <p>You must create an account to use the Service. You are responsible for maintaining the confidentiality of your login credentials and for all activity under your account. You agree to provide accurate and complete information during registration and to keep your account information current.</p>
                </section>

                <section>
                  <h3 className="font-semibold text-base mb-2">1.4 Acceptable Use</h3>
                  <p>You agree not to misuse the Service, including but not limited to: attempting to gain unauthorized access to other users' data, using the Service for illegal purposes, interfering with the Service's infrastructure, or submitting false or misleading financial data.</p>
                </section>

                <section>
                  <h3 className="font-semibold text-base mb-2">1.5 Intellectual Property</h3>
                  <p>All content, features, and functionality of the Service are owned by My Cab Tax USA and are protected by copyright, trademark, and other intellectual property laws. You may not reproduce, distribute, or create derivative works from any part of the Service without written permission.</p>
                </section>

                <section>
                  <h3 className="font-semibold text-base mb-2">1.6 Termination</h3>
                  <p>We may suspend or terminate your account at any time for violation of these Terms. You may delete your account at any time. Upon termination, your right to use the Service ceases immediately, and we may delete your data after a reasonable retention period.</p>
                </section>

                <section>
                  <h3 className="font-semibold text-base mb-2">1.7 Governing Law & Dispute Resolution</h3>
                  <div className="space-y-3">
                    <div>
                      <p className="font-medium">1.7.1 Governing Law</p>
                      <p>These Terms and your use of My Cab Tax USA shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflict of law principles.</p>
                    </div>
                    <div>
                      <p className="font-medium">1.7.2 Mandatory Binding Arbitration</p>
                      <p>You and My Cab Tax USA agree that any dispute, claim, or controversy arising out of or relating to this App shall be settled by binding individual arbitration administered by the American Arbitration Association (AAA) in accordance with its Consumer Arbitration Rules. This arbitration clause survives termination of your account.</p>
                    </div>
                    <div>
                      <p className="font-medium">1.7.3 Class Action Waiver</p>
                      <p className="uppercase text-xs tracking-wide">YOU AGREE THAT ANY ARBITRATION OR PROCEEDING SHALL BE LIMITED TO THE DISPUTE BETWEEN US INDIVIDUALLY. TO THE FULL EXTENT PERMITTED BY LAW, NO ARBITRATION OR PROCEEDING SHALL BE JOINED WITH ANY OTHER AND THERE IS NO RIGHT OR AUTHORITY FOR ANY DISPUTE TO BE ARBITRATED ON A CLASS-ACTION BASIS OR TO UTILIZE CLASS ACTION PROCEDURES.</p>
                    </div>
                    <div>
                      <p className="font-medium">1.7.4 Small Claims Court Option</p>
                      <p>Notwithstanding the above, either party may bring an individual action in small claims court for disputes within the scope of that court's jurisdiction.</p>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="font-semibold text-base mb-2">1.8 Contact for Legal Notices</h3>
                  <p>All formal legal notices, complaints, arbitration demands, cease-and-desist letters, subpoenas, and correspondence must be directed exclusively to:</p>
                  <p className="font-medium mt-2 mb-2">legal@mycabtax.com</p>
                  <p>This is the sole designated address for service of process, dispute notifications, arbitration filings, and any formal legal communications under these Terms. <strong>Any official notice not sent to this address shall not be deemed properly served and will not trigger any obligation or deadline under these Terms.</strong> General support or informational emails sent to other addresses (e.g., info@ or support@) do not constitute legal notice.</p>
                </section>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="privacy">
            <Card className="p-6 sm:p-8">
              <h2 className="font-display font-bold text-2xl mb-4">2. Privacy Policy (GLBA & CCPA Compliant)</h2>
              <p className="text-sm text-muted-foreground mb-6">Last updated: February 2026</p>

              <div className="space-y-6 text-sm leading-relaxed text-foreground/90">
                <section>
                  <h3 className="font-semibold text-base mb-2">2.1 Information We Collect</h3>
                  <p>We collect information you provide directly, including: your name, email address, and profile picture (via Auth0 authentication), as well as financial data you enter such as income records, expense records, miles driven, and platform fees. We collect financial data and mileage logs to provide our services. We also collect usage data such as login times and feature interactions.</p>
                </section>

                <section>
                  <h3 className="font-semibold text-base mb-2">2.2 How We Use Your Information</h3>
                  <p>Your information is used to: provide and improve the Service, calculate tax estimates, generate reports, communicate with you about your account, and comply with legal obligations. We do not sell your personal financial data to third parties.</p>
                </section>

                <section>
                  <h3 className="font-semibold text-base mb-2">2.3 Data Protection & Encryption</h3>
                  <p>We use industry-standard encryption to protect your financial information. We use Auth0 for secure authentication, supporting multi-factor authentication (MFA) and biometric login. Your password is never stored on our servers. All data is transmitted using TLS encryption. We implement industry-standard security measures to protect your financial data, including any Social Security Numbers (SSN) and bank information if provided.</p>
                </section>

                <section>
                  <h3 className="font-semibold text-base mb-2">2.4 Data Storage & Retention</h3>
                  <p>Your data is stored in secure PostgreSQL databases hosted on encrypted cloud infrastructure with geographically redundant backups. We retain your data for as long as your account is active. You may request deletion of your data at any time via Settings or by contacting us. After account deletion, your data will be permanently removed within 30 days.</p>
                  <ul className="list-disc pl-5 space-y-1 mt-2">
                    <li><strong>Free Tier:</strong> Tax data is retained while your account is active. Data is automatically deleted after 90 days of account inactivity. You are responsible for exporting and backing up your records before this period expires.</li>
                    <li><strong>Pro Tier (Tax Vault):</strong> All tax data, receipt images, mileage logs, and financial records are stored in our secure Tax Vault with <strong>guaranteed 7-year data retention</strong>, provided your Pro subscription remains in good standing. This exceeds the IRS minimum 3-year recordkeeping requirement (IRC Section 6501(a)) and aligns with the IRS recommended 7-year retention for self-employment records.</li>
                    <li><strong>Subscription Lapse:</strong> If a Pro subscription lapses, you have a 30-day grace period to export your data. After the grace period, your account reverts to Free Tier terms. Re-subscribing within the grace period fully restores your Tax Vault without data loss.</li>
                    <li><strong>Tamper-Evident Storage:</strong> All record modifications are logged in a tamper-evident audit trail. Digitally signed Record Integrity Certificates verify data authenticity for IRS audit purposes.</li>
                  </ul>
                </section>

                <section>
                  <h3 className="font-semibold text-base mb-2">2.5 Third-Party Services</h3>
                  <p>We use the following third-party services: Auth0 (authentication), and cloud infrastructure providers for hosting. Each of these services has its own privacy policy. We share only the minimum data necessary for these services to function.</p>
                </section>

                <section>
                  <h3 className="font-semibold text-base mb-2">2.6 Your State Privacy Rights (CCPA/VCDPA)</h3>
                  <p>Residents of California, Virginia, Colorado, Connecticut, and other states with consumer privacy laws have the following rights:</p>
                  <ul className="list-disc pl-5 space-y-1 mt-2">
                    <li><strong>Right to Know:</strong> You may request what personal data we collect, use, and disclose about you.</li>
                    <li><strong>Right to Delete ("Right to be Forgotten"):</strong> You may request permanent deletion of your personal data. Use the "Request Data Deletion" button in Settings to exercise this right. This satisfies your "Right to be Forgotten" under state privacy laws including CCPA (California), VCDPA (Virginia), and CPA (Colorado).</li>
                    <li><strong>Right to Opt-Out:</strong> You have the right to opt out of the sale of your personal data. We do not sell your personal financial data to third parties.</li>
                    <li><strong>Right to Correct:</strong> You may request correction of inaccurate personal data.</li>
                    <li><strong>Right to Data Portability:</strong> You may export your data in a portable format using the Export feature.</li>
                    <li><strong>Non-Discrimination:</strong> We will not discriminate against you for exercising your privacy rights.</li>
                  </ul>
                  <p className="mt-2">To exercise any of these rights, use the in-app controls in Settings or contact us at legal@mycabtax.com.</p>
                </section>

                <section>
                  <h3 className="font-semibold text-base mb-2">2.7 Children's Privacy</h3>
                  <p>The Service is not intended for individuals under the age of 18. We do not knowingly collect personal information from children. If we become aware that we have collected data from a child, we will delete it promptly.</p>
                </section>

                <section>
                  <h3 className="font-semibold text-base mb-2">2.8 Contact Us</h3>
                  <p>If you have questions about this Privacy Policy or wish to exercise your data rights, please contact us at legal@mycabtax.com.</p>
                </section>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="tax">
            <Card className="p-6 sm:p-8">
              <h2 className="font-display font-bold text-2xl mb-4">3. Limitation of Liability & Tax Disclaimers</h2>
              <p className="text-sm text-muted-foreground mb-6">Last updated: February 2026</p>

              <div className="space-y-6 text-sm leading-relaxed text-foreground/90">
                <section>
                  <h3 className="font-semibold text-base mb-2">3.1 Not Tax Advice</h3>
                  <p>My Cab Tax USA is a bookkeeping tool, NOT a tax advisory service. The Service does not provide tax advice, legal advice, or accounting services. The calculations and estimates provided by the Service are for informational and organizational purposes only and should not be relied upon as a substitute for professional tax advice. You should consult with a qualified CPA or Tax Attorney before submitting any returns to the IRS.</p>
                </section>

                <section>
                  <h3 className="font-semibold text-base mb-2">3.2 Limitation of Liability</h3>
                  <p>The Service is provided "as is" and "as available." To the maximum extent permitted by law, My Cab Tax USA's total liability shall not exceed the amount paid by the user for the service in the last 12 months, or $100, whichever is less. My Cab Tax USA shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Service, including but not limited to IRS audits, penalties, interest, or any tax-related consequences.</p>
                </section>

                <section>
                  <h3 className="font-semibold text-base mb-2">3.3 IRS Rate Estimates</h3>
                  <p>The Service uses publicly available IRS standard mileage rates and self-employment tax rates for the 2026 tax year. These rates are subject to change by the IRS. The current rates used are: standard mileage rate of $0.725 per mile and self-employment tax rate of 15.3%. We make reasonable efforts to keep rates current but cannot guarantee accuracy at all times.</p>
                </section>

                <section>
                  <h3 className="font-semibold text-base mb-2">3.4 Accuracy of Calculations</h3>
                  <p>Tax calculations provided by the Service are estimates based on the data you enter. Accuracy of data entry is the sole responsibility of the driver. Actual tax liability may differ based on your complete financial situation, filing status, other income sources, deductions, credits, and applicable state and local taxes not accounted for by this Service.</p>
                </section>

                <section>
                  <h3 className="font-semibold text-base mb-2">3.5 Schedule C Simplified</h3>
                  <p>The Service provides a simplified Schedule C (Profit or Loss from Business) summary. It does not account for all possible deductions, credits, depreciation methods, or business structures. Complex tax situations may require additional forms and professional guidance.</p>
                </section>

                <section>
                  <h3 className="font-semibold text-base mb-2">3.6 Quarterly Estimated Payments</h3>
                  <p>Quarterly payment estimates are provided as a general guide. Actual quarterly estimated tax payment obligations depend on your total expected tax liability, withholding from other sources, and Safe Harbor provisions. The quarterly deadlines shown (April 15, June 15, September 15, and January 15) are general IRS deadlines and may shift if they fall on weekends or holidays.</p>
                </section>

                <section>
                  <h3 className="font-semibold text-base mb-2">3.7 Consult a Tax Professional</h3>
                  <p>We strongly recommend consulting a qualified tax professional, CPA, enrolled agent, or Tax Attorney for personalized tax advice. My Cab Tax USA is not a substitute for professional tax preparation or tax submission services. You are solely responsible for the accuracy of your tax returns and compliance with all applicable tax laws.</p>
                </section>

                <section>
                  <h3 className="font-semibold text-base mb-2">3.8 No Guarantee of Tax Savings</h3>
                  <p>Use of this Service does not guarantee any particular tax outcome, deduction amount, or tax savings. Results depend entirely on the accuracy and completeness of the data you provide.</p>
                </section>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="subscriptions">
            <Card className="p-6 sm:p-8">
              <h2 className="font-display font-bold text-2xl mb-4">4. Subscription Tiers & Tax Vault</h2>
              <p className="text-sm text-muted-foreground mb-6">Last updated: February 2026</p>

              <div className="space-y-6 text-sm leading-relaxed text-foreground/90">
                <section>
                  <h3 className="font-semibold text-base mb-2">4.1 Overview of Service Tiers</h3>
                  <p>My Cab Tax USA offers two service tiers designed to meet different needs: a Free Tier for casual users, and a Pro Tier (subscription) for drivers who require long-term, audit-ready data retention and advanced features.</p>
                </section>

                <section>
                  <h3 className="font-semibold text-base mb-2">4.2 Free Tier</h3>
                  <div className="space-y-2">
                    <p>The Free Tier provides core tax tracking features with the following terms:</p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li><strong>Data Access:</strong> Active usage only. Data is available while you are actively using the Service.</li>
                      <li><strong>Data Retention:</strong> Tax data is automatically deleted after 90 days of account inactivity. It is your responsibility to export and back up your records before this period expires.</li>
                      <li><strong>Export:</strong> Basic CSV export of your tax summary and records.</li>
                      <li><strong>Receipt Storage:</strong> Receipt photo uploads are not available on the Free Tier. Only text-based data (numbers, categories, descriptions) is stored.</li>
                      <li><strong>Legal Responsibility:</strong> You are solely responsible for maintaining your own records for IRS compliance.</li>
                    </ul>
                  </div>
                </section>

                <section>
                  <h3 className="font-semibold text-base mb-2">4.3 Pro Tier (Subscription)</h3>
                  <div className="space-y-2">
                    <p>The Pro Tier is a paid subscription that provides enhanced data security, long-term retention, and advanced features:</p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li><strong>Full Audit-Ready Vault:</strong> All tax data is stored in our secure Tax Vault with guaranteed data redundancy and encrypted backups.</li>
                      <li><strong>7-Year Guaranteed Retention:</strong> We guarantee data storage for up to 7 years, provided your Pro account remains in good standing. This exceeds the IRS minimum 3-year recordkeeping requirement.</li>
                      <li><strong>Certified PDF Audit Packs:</strong> Export your records as certified PDF "Audit Packs" including receipt images, categorized expenses, mileage logs, and a Record Integrity Certificate.</li>
                      <li><strong>Unlimited Receipt Photo Uploads:</strong> Upload and store unlimited receipt photos attached to your expense records for complete audit documentation.</li>
                      <li><strong>Record Integrity Certificate:</strong> We provide a digitally signed certificate verifying the integrity and timestamp of your stored records.</li>
                    </ul>
                  </div>
                </section>

                <section>
                  <h3 className="font-semibold text-base mb-2">4.4 Tax Vault Service Definition</h3>
                  <p>The "Tax Vault" is My Cab Tax USA's secure, redundant data storage service available exclusively to Pro Tier subscribers. The Tax Vault provides:</p>
                  <ul className="list-disc pl-5 space-y-1 mt-2">
                    <li>Encrypted storage of all financial records, mileage logs, expense data, and receipt images</li>
                    <li>Geographically redundant backups to protect against data loss</li>
                    <li>Guaranteed availability and data integrity for the duration of an active Pro subscription</li>
                    <li>Tamper-evident audit trails for all record modifications</li>
                  </ul>
                  <p className="mt-2">The Tax Vault is designed to help drivers maintain IRS-compliant records for the recommended 7-year retention period. However, the Tax Vault does not constitute legal or tax advice, and My Cab Tax USA makes no representations about the legal sufficiency of stored records for any particular audit or proceeding.</p>
                </section>

                <section>
                  <h3 className="font-semibold text-base mb-2">4.5 Subscription Lapse & Grace Period</h3>
                  <div className="space-y-2">
                    <p>If a Pro subscription lapses (due to non-payment, cancellation, or any other reason), the following terms apply:</p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li><strong>30-Day Grace Period:</strong> Upon subscription lapse, you will have a 30-day grace period to download all of your data, including receipt photos, tax summaries, and any Audit Pack exports.</li>
                      <li><strong>Post-Grace Period:</strong> After the 30-day grace period expires, your account will revert to Free Tier status. Receipt photos and any Pro-exclusive data will be permanently deleted. Text-based records (income, expenses, mileage) will be retained under Free Tier terms (90-day inactivity rule).</li>
                      <li><strong>Re-subscription:</strong> If you re-subscribe to Pro within the 30-day grace period, your Tax Vault data will be fully restored and the 7-year retention guarantee will resume without interruption.</li>
                    </ul>
                  </div>
                </section>

                <section>
                  <h3 className="font-semibold text-base mb-2">4.6 Good Standing Requirement</h3>
                  <p>The 7-year data retention guarantee is contingent upon the Pro account remaining in "good standing," which means: the subscription is current and not past due, the account has not been suspended or terminated for violation of our Terms of Service, and the user has not submitted fraudulent or illegal data. My Cab Tax USA reserves the right to terminate accounts that violate these conditions.</p>
                </section>

                <section>
                  <h3 className="font-semibold text-base mb-2">4.7 Pricing & Changes</h3>
                  <p>Pro Tier pricing is published on our website and may be updated from time to time. We will provide at least 30 days' notice before any price increase takes effect. Existing subscribers will be grandfathered at their current rate until their next renewal cycle after the notice period.</p>
                </section>

                <section className="mt-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Card className="p-4 border-border/60" data-testid="card-tier-free">
                      <div className="flex items-center gap-2 mb-3">
                        <Shield className="h-5 w-5 text-muted-foreground" />
                        <h4 className="font-semibold text-base">Free Tier</h4>
                      </div>
                      <ul className="space-y-2 text-xs text-muted-foreground">
                        <li>Active usage data access</li>
                        <li>90-day inactivity retention</li>
                        <li>Basic CSV export</li>
                        <li>Text data only (no receipt photos)</li>
                        <li>User is solely responsible</li>
                      </ul>
                    </Card>
                    <Card className="p-4 border-primary/40 bg-primary/5" data-testid="card-tier-pro">
                      <div className="flex items-center gap-2 mb-3">
                        <Crown className="h-5 w-5 text-primary" />
                        <h4 className="font-semibold text-base text-primary">Pro Tier</h4>
                      </div>
                      <ul className="space-y-2 text-xs text-foreground/80">
                        <li>Full Audit-Ready Tax Vault</li>
                        <li>7-Year Guaranteed Retention</li>
                        <li>Certified PDF Audit Packs</li>
                        <li>Unlimited receipt photo uploads</li>
                        <li>Record Integrity Certificate</li>
                      </ul>
                    </Card>
                  </div>
                </section>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <footer className="py-12 border-t border-border/40 mt-auto bg-background">
        <div className="max-w-7xl mx-auto px-4 space-y-6">
          <Card className="p-4 sm:p-6 border-border/40 bg-muted/30" data-testid="card-circular-230">
            <p className="text-xs text-muted-foreground leading-relaxed uppercase tracking-wide font-medium mb-2">IRS Circular 230 Disclosure</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              To ensure compliance with requirements imposed by the IRS, we inform you that any tax information contained in this communication (including any attachments) is not intended or written to be used, and cannot be used, for the purpose of (i) avoiding penalties under the Internal Revenue Code or (ii) promoting, marketing or recommending to another party any transaction or matter addressed herein.
            </p>
          </Card>
          <p className="text-center text-muted-foreground text-xs">Legal Notices: legal@mycabtax.com</p>
          <p className="text-center text-muted-foreground text-sm">&copy; {new Date().getFullYear()} My Cab Tax USA. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
