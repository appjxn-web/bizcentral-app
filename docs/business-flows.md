# jxnPlus Application Business Flows

This document outlines the major end-to-end business processes supported by the application.

## 1. Company Setup & Financial Year-End Flow

This flow describes the process from initial company configuration to financial reporting and filing.

1.  **Initial Setup (Admin):**
    *   The Admin navigates to **Company & Settings > Company** to fill in essential details like name, address, logo, and statutory information (PAN, GSTIN).
    *   The Admin goes to **Finance > Statutory Metrix** to configure default tax rates (GST, TDS) and payroll contributions (PF, ESI).
    *   The Admin reviews the **Chart of Accounts** and adds any custom ledger accounts or groups as needed.

2.  **Day-to-Day Operations (All Roles):**
    *   **Sales:** When a customer places an order (**Customer Flow**), a `Sales Order` is created, which automatically generates corresponding accounting entries in the `JournalVouchers` collection upon completion.
    *   **Purchases:** When goods are received via a `GRN`, accounting entries are posted to credit the supplier and debit inventory and tax ledgers.
    *   **Expenses:** Employees file reimbursement requests. When approved and paid via **Finance > Reimbursement Process**, a payment voucher is created.

3.  **Accounting & Reconciliation (Accounts Manager):**
    *   The Accounts Manager uses the **Day Book** to review all daily transactions.
    *   They manage payments to suppliers and process reimbursements via the **Reimbursement Process** screen.
    *   Bank statements are reconciled against entries in the **Bank & Cash** module.

4.  **Reporting & Year-End (Accounts Manager/CEO):**
    *   At month-end or year-end, financial statements like the **Trial Balance**, **Profit & Loss Statement**, and **Balance Sheet** are generated. These reports read from the real-time balances of all ledger accounts.
    *   The **GST** report is generated to get a summary of tax liability (Output GST vs. Input Tax Credit) for filing returns.

---

## 2. Customer Purchase & Service Lifecycle

This flow describes the journey of a customer from purchasing a product to requesting service.

1.  **Discovery & Purchase:**
    *   A visitor lands on the homepage (`/`) and browses products.
    *   They add items to their cart. The cart state is managed locally in the browser.
    *   The customer proceeds to **/checkout**, provides their details, selects a pickup point (either the company warehouse or a partner location), and makes a payment.
    *   Upon successful payment, an `Order` document is created in the `/orders` collection with a `userId` linking it to the customer.

2.  **Product Registration (Post-Purchase):**
    *   After receiving the product, the customer navigates to **My Products** in their dashboard.
    *   They register their product by entering its unique serial number (found on the product QR code).
    *   This creates a `RegisteredProduct` document, linking the physical item to the customer and activating its warranty period.

3.  **Service Request:**
    *   If the product requires service, the customer goes to **My Products** and clicks "Request Service".
    *   They describe the issue, and a `ServiceRequest` document is created.

4.  **Service & Resolution:**
    *   A **Service Manager** sees the new request, assigns an engineer, and updates the status to `In Progress`.
    *   If the service requires payment (e.g., out of warranty), the manager sends a quotation. The customer accepts or rejects it.
    *   Once the work is complete, the status is updated to `Work Complete`, an invoice is generated, and finally, it's marked as `Completed` after payment.
    *   The entire service history is logged against the `RegisteredProduct`.

---

## 3. Partner Sales & Commission Flow

This flow describes how a partner (e.g., Dealer, Franchisee) operates within the system.

1.  **Onboarding:**
    *   An Admin creates a new user and assigns them the **Partner** role via the **Users** management screen.
    *   The Admin navigates to **Sales > Partners Management** and sets the specific `Commission & Discount Matrix` for that partner, defining their earning potential per product category.

2.  **Lead & Quotation Management:**
    *   The Partner logs in and accesses their dashboard at **/dashboard/dashboards/partner**.
    *   They manage potential customers in the **Sales > Lead** section.
    *   They create and send official quotations to leads via **Sales > Create Quotation**.

3.  **Order Placement on Behalf of Customer:**
    *   When a customer agrees to purchase, the Partner can place an order for them through the system.
    *   During checkout, the Partner selects **their own location** as the `PickupPoint`. The system automatically sets the `assignedToUid` field on the `Order` to the Partner's user ID.

4.  **Commission & Payout:**
    *   When the order status changes to `Delivered`, the commission is calculated based on the Partner's matrix and the items in the order.
    *   This commission amount is moved to the Partner's `commissionPayable` field in their `UserWallet`.
    *   The Partner can view their total earned and pending commissions in their **Commission Report**.
    *   An **Accounts Manager** processes payouts, which credits the Partner's `walletBalance` and deducts from `commissionPayable`.

---

## 4. Employee & Admin Workflows

This section outlines typical internal processes.

1.  **Employee Onboarding (HR Manager):**
    *   An Admin creates a new user with the **Employee** role.
    *   The HR Manager sees the new employee in the **HR > On-board** pipeline.
    *   They manage document collection (`Aadhar`, `PAN`, etc.) and training schedules, moving the employee card across the board from `Hired` to `Completed`.

2.  **Task Management (Manager/Admin):**
    *   A Manager creates a task (e.g., "Follow up with new leads") via **Create Task** and assigns it to an Employee.
    *   The Employee sees the new task on their **My Tasks** page. They can start, pause, and mark the task as complete (submitting proof if required).

3.  **Procurement (Purchase Manager):**
    *   The system flags that stock is low for a "Bought" item.
    *   The Purchase Manager creates a **Purchase Request**.
    *   An Admin or Manager approves the request.
    *   The Purchase Manager converts the approved request into a **Purchase Order (PO)** and sends it to the supplier.
    *   When goods arrive, the **Gate Keeper** or Store Manager creates a **Goods Received Note (GRN)** against the PO, which automatically updates inventory levels.
    *   The **Accounts Manager** sees the GRN in the **Payment Approval** queue and processes the payment to the supplier.

4.  **Production (Production Manager):**
    *   The system detects demand for a "Made" product based on sales orders and minimum stock levels.
    *   The Production Manager creates a **Work Order** for the required quantity.
    *   The Work Order is assigned, and tasks are automatically created for relevant employees based on the product's **BOM**.
    *   Once production tasks are complete, the status moves to **Under QC**. A quality checker inspects the item and marks it as `Passed` or `Failed`.
    *   If passed, the finished goods inventory is updated, and the product is ready for dispatch.
