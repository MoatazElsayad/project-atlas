window.ATLAS = {
  "nodes": [
    {
      "id": "cli",
      "title": "CLI + presets",
      "sub": "Where a run starts",
      "owner": "Youssef",
      "summary": "b6_sim builds a scenario from a named preset and command-line options.",
      "details": [
        "Choose fixed_priority, rate_monotonic or edf; heap or sorted_list timers; quantum, horizon and inheritance.",
        "Presets include rr_preemption, priority_inversion, semaphore_signal, sleep_order, suspend_resume, rm_edf_compare and overload.",
        "Options configure a new C++ run. Changing a dashboard selection only chooses an existing recording."
      ],
      "mutations": "Writes ScenarioInput: Scenario plus timed ControlAction records.",
      "example": "b6_sim --scenario priority_inversion --inheritance off",
      "cost": "Input construction is outside the tick loop.",
      "sources": [
        "app/src/main.cpp",
        "app/src/presets.cpp"
      ],
      "status": "implemented"
    },
    {
      "id": "simulation",
      "title": "Simulation",
      "sub": "Owns one complete run",
      "owner": "Youssef",
      "summary": "The application wrapper constructs the collaborators, connects them and catches failed runs.",
      "details": [
        "Construction order: Registry → RunTrace → Scheduler → optional ResourceManager → TimerManager.",
        "Destruction is reversed. Resources disappear before their scheduler hooks; Registry survives every borrower.",
        "run() runs once. An engine exception marks the trace invalid; export can still preserve the error.",
        "metrics() returns results only for a finished valid run."
      ],
      "mutations": "Owns component lifetimes; attach() connects resources and timers to Scheduler.",
      "example": "An invalid run is an inspectable recording, not a successful simulation.",
      "cost": "No claim of hardware real-time execution.",
      "sources": [
        "app/include/simulation.h",
        "app/src/simulation.cpp"
      ],
      "status": "implemented"
    },
    {
      "id": "config",
      "title": "Scenario + configuration",
      "sub": "Input model & limits",
      "owner": "Moataz",
      "summary": "A Scenario owns TaskSpec scripts, resource specifications and RunConfig.",
      "details": [
        "RunConfig selects policy, timer backend, inheritance, horizon, tick duration and quantum.",
        "Ceilings: 32 tasks, 512 jobs, 8 mutexes and 8 semaphores, 64 instructions per task, 2,000 ticks.",
        "Trace ceilings: 50,000 events and 100,000 snapshot job rows.",
        "Fixed priority supports resources. RM/EDF support independent periodic RUN/END scripts; inheritance is unsupported for them."
      ],
      "mutations": "Input is copied into Registry. RM assignment adjusts that private copy before validation/publication.",
      "example": "periodTicks = 0 means one-shot; positive means recurring releases.",
      "cost": "Fixed ceilings bound storage; they do not eliminate allocation overhead.",
      "sources": [
        "kernel/include/types.h",
        "kernel/src/validation.cpp"
      ],
      "status": "implemented"
    },
    {
      "id": "validation",
      "title": "Validation",
      "sub": "Reject unsupported input",
      "owner": "Moataz",
      "summary": "Checks IDs, priorities, timings, capacities, scripts and policy restrictions before a run.",
      "details": [
        "Task/resource IDs are nonnegative and unique within their kind; priority is 0..31.",
        "RUN/SLEEP durations must be positive; scripts end with END; resource references must exist.",
        "Reject recursive/nested locks, unmatched unlock, and ending, sleeping or WAIT while holding a mutex.",
        "Checks release definitions, total job capacity, overflow and unsupported policy/resource combinations.",
        "Runtime guards also check actual states; static validation alone cannot establish every dynamic interaction."
      ],
      "mutations": "Returns an error string; Registry refuses invalid input before publishing task pointers.",
      "example": "Two tasks with the same taskId are rejected rather than silently replacing each other.",
      "cost": "Bounded scans and duplicate checks; not on every dispatch.",
      "sources": [
        "kernel/src/validation.cpp",
        "tests/test_kernel_foundation.cpp"
      ],
      "status": "implemented"
    },
    {
      "id": "registry",
      "title": "Registry",
      "sub": "Stable ownership + ID lookup",
      "owner": "Moataz",
      "summary": "Owns the task definitions and every released Job for the entire run.",
      "details": [
        "TaskSpec values live in a copied Scenario; Jobs live in a fixed array of 512 slots.",
        "Hash maps hold borrowed pointers into that storage. Copy and move are disabled to preserve addresses.",
        "releaseJob checks increasing (releaseTick, taskId), schedule alignment and capacity, then assigns a new jobId.",
        "Scheduler decides when to release; Registry does not automatically generate releases.",
        "RM assignment was integrated by Marc into Registry construction."
      ],
      "mutations": "Creates identity, deadline, effective priority, release sequence and initial quantum. Publishes count only after map insertion succeeds.",
      "example": "A task released at ticks 0 and 5 has two separate Jobs, even if the first is still blocked.",
      "cost": "Expected O(1) map lookup; collisions can make it O(n).",
      "sources": [
        "kernel/include/registry.h",
        "kernel/src/registry.cpp"
      ],
      "status": "implemented"
    },
    {
      "id": "task",
      "title": "TaskSpec / TCB",
      "sub": "Definition, not an execution",
      "owner": "Moataz",
      "summary": "TCB is a C++ alias for TaskSpec in this project—not a second record.",
      "details": [
        "Contains taskId, name, basePriority, firstRelease, periodTicks, relativeDeadline and instruction script.",
        "It describes repeatable work. Mutable execution progress belongs to Job.",
        "Registry exposes task configuration through const access after loading.",
        "Tick = int64_t; TaskId/JobId/ResourceId/TimerId = int; Sequence = uint64_t. These aliases clarify meaning but are not strong distinct types."
      ],
      "mutations": "Immutable after publication; RM can assign basePriority on the Registry copy before publication.",
      "example": "using TCB = TaskSpec; task T can produce T0, T1, T2…",
      "cost": "One definition per task; one execution record per release.",
      "sources": [
        "kernel/include/types.h"
      ],
      "status": "implemented"
    },
    {
      "id": "job",
      "title": "Job",
      "sub": "One mutable execution",
      "owner": "Moataz",
      "summary": "A Job is one release of one task, shared by reference between kernel components.",
      "details": [
        "Identity/time: jobId, taskId, releaseTick, absoluteDeadline and optional start/completion/miss times.",
        "Progress: scriptIndex, cpuBurstRemaining, totalCpuUsed and quantumRemaining.",
        "State: state, suspended, blockReason; resource: heldMutexId, blockedResourceId, waitNode.",
        "Membership: readyNode or inEdfQueue + edfIndex; timer: timerId + wakeTick.",
        "Unknown optional values mean absent, not tick 0. Export uses null. ID 0 is valid for a task or resource."
      ],
      "mutations": "Scheduler changes CPU progress and runnable membership. ResourceManager changes waits, ownership and donation. TimerManager changes sleep metadata.",
      "example": "releaseTick 1 + relativeDeadline 5 = absoluteDeadline 6.",
      "cost": "Records stay in place until the run is destroyed.",
      "sources": [
        "kernel/include/types.h",
        "docs/shared-contracts.md"
      ],
      "status": "implemented"
    },
    {
      "id": "hash",
      "title": "Hash maps",
      "sub": "Borrowed pointers by ID",
      "owner": "Moataz",
      "summary": "Registry uses the existing HashMap to find tasks and jobs without scanning every record.",
      "details": [
        "tasksById maps task IDs to TaskSpec addresses; jobsById maps job IDs to Job addresses.",
        "The map owns its internal map nodes, not the pointed-to task/job objects.",
        "Registry reserves bucket arrays before releases; put() can still allocate a map node.",
        "Milestone 2 used the committed bitmap/hash-map code; it did not rewrite those structures."
      ],
      "mutations": "Updates ID indexes when a task is published or a job released.",
      "example": "ownerJobId → findJob(ownerJobId) → stable owner record.",
      "cost": "Expected O(1), worst O(n).",
      "sources": [
        "ds/include/hash_map.h",
        "ds/src/hash_map.tpp",
        "kernel/src/registry.cpp"
      ],
      "status": "implemented"
    },
    {
      "id": "scheduler",
      "title": "Scheduler",
      "sub": "Clock, dispatch & interpreter",
      "owner": "Youssef",
      "summary": "Chooses the running job, interprets scripts and coordinates every boundary.",
      "details": [
        "One simulated CPU and integer ticks. A running job remains in its ready ring or EDF heap.",
        "Calls Registry for releases, ResourceManager for lock/permit operations, TimerManager for sleep/wakes.",
        "Implements onBlocked and onReady to keep ready membership consistent.",
        "Does not yet override ResourceSchedulerHooks::onPriorityChanged at this revision.",
        "Checks ready invariants at boundaries: one running job, exact membership, correct handles and bitmap."
      ],
      "mutations": "Writes running pointer, states, scriptIndex, CPU counters, timestamps, quantum and ready membership.",
      "example": "A successful WAIT that blocks advances scriptIndex once. The later grant completes it; it must not be repeated.",
      "cost": "Selection is bounded bitmap work or O(1) EDF peek; snapshot/deadline scans add O(jobs) per tick.",
      "sources": [
        "kernel/include/scheduler.h",
        "kernel/src/scheduler.cpp"
      ],
      "status": "implemented"
    },
    {
      "id": "phases",
      "title": "Six tick phases",
      "sub": "Deterministic boundary order",
      "owner": "Youssef",
      "summary": "Each boundary t follows one order so simultaneous events have repeatable results.",
      "details": [
        "1 SETTLE: account previous CPU interval, complete bursts and nonblocking instructions.",
        "2 INPUTS: releases ordered by task ID, then due timers, then suspend/resume controls.",
        "3 STABILIZE: select and execute zero-time instructions until CPU work or idle.",
        "4 DEADLINES: record one miss for each unfinished job with deadline ≤ t.",
        "5 SNAPSHOT: copy stable state. 6 EXECUTE: record/run [t,t+1) if t < horizon."
      ],
      "mutations": "Coordinates when each subsystem may change Job state.",
      "example": "Completion at t = deadline is on time: SETTLE runs before DEADLINES.",
      "cost": "Snapshots and deadline scans are distinct from dispatch costs.",
      "sources": [
        "kernel/src/scheduler.cpp",
        "kernel/include/types.h"
      ],
      "status": "implemented"
    },
    {
      "id": "ready",
      "title": "Ready rings + round-robin",
      "sub": "Fixed priority / RM",
      "owner": "Youssef",
      "summary": "32 CircularList<Job> rings group runnable jobs by effective priority.",
      "details": [
        "Largest priority number is most urgent. Select the front of that ring.",
        "Equal priorities rotate when quantum reaches zero. Arrival joins the back.",
        "Higher-priority preemption preserves remaining quantum; wake/grant/resume gives a fresh quantum.",
        "READY and RUNNING jobs appear exactly once; BLOCKED, SUSPENDED and COMPLETED jobs appear zero times.",
        "Job::readyNode is a saved removal handle; removal invalidates and clears it."
      ],
      "mutations": "enqueue/dequeue/rotate update ring membership and bitmap together.",
      "example": "At equal priority with quantum 1: A, B, A, B… unless a more urgent task arrives.",
      "cost": "O(1) link work with handles; node allocation costs extra.",
      "sources": [
        "kernel/src/scheduler.cpp",
        "ds/include/circular_list.h"
      ],
      "status": "implemented"
    },
    {
      "id": "bitmap",
      "title": "Priority bitmap",
      "sub": "Which ready rings have jobs?",
      "owner": "Moataz",
      "summary": "One bit per priority level tells the scheduler which ring is nonempty.",
      "details": [
        "bit p = 1 if and only if ring p is nonempty.",
        "The highest set level identifies the most urgent fixed-priority/RM ring.",
        "It stores occupancy, not Jobs or their order.",
        "Structure is associated with Moataz; Youssef owns its scheduler integration."
      ],
      "mutations": "Scheduler sets/clears bits on enqueue, dequeue and priority moves.",
      "example": "If ring 3 becomes empty after blocking, clear bit 3 before selecting again.",
      "cost": "Current scan checks at most 32 bits: bounded O(1), not claimed to be one instruction.",
      "sources": [
        "ds/include/bitmap.h",
        "ds/src/bitmap.cpp",
        "kernel/src/scheduler.cpp"
      ],
      "status": "implemented"
    },
    {
      "id": "edf",
      "title": "EDF",
      "sub": "Earliest Deadline First",
      "owner": "Marc",
      "summary": "Select the runnable job with the smallest absolute deadline.",
      "details": [
        "EdfEntry order is (absoluteDeadline, releaseSequence, jobId), never pointer address.",
        "Marc supplies the heap/entry contract; Youssef integrates the ready heap into Scheduler.",
        "The running job remains in the heap. Blocking/completion removes membership.",
        "An index callback keeps Job::edfIndex synchronized with heap swaps.",
        "RM/EDF runs are resource-free independent periodic tasks in this model."
      ],
      "mutations": "Heap insertion/removal updates inEdfQueue and edfIndex. Deadline keys remain stable.",
      "example": "A deadline at 6 outranks a deadline at 8, regardless of basePriority.",
      "cost": "Peek O(1); insert/removeAt O(log n).",
      "sources": [
        "ds/include/MinHeap.h",
        "kernel/include/scheduler.h",
        "kernel/src/scheduler.cpp"
      ],
      "status": "implemented"
    },
    {
      "id": "rm",
      "title": "Rate monotonic",
      "sub": "Period → fixed priority",
      "owner": "Marc",
      "summary": "Assign shorter-period tasks higher fixed priorities before jobs are created.",
      "details": [
        "Collect distinct periods in ascending order; shortest gets 31, next distinct period 30, and so on.",
        "Equal periods receive the same priority and share a round-robin ring.",
        "Registry assigns these on its private Scenario before validation/publication.",
        "RM reuses fixed-priority scheduling; it is not another ready-queue implementation."
      ],
      "mutations": "Writes TaskSpec::basePriority before publication; each released Job copies it to effectivePriority.",
      "example": "A: period 5 → 31; B: period 7 → 30.",
      "cost": "Bounded insertion-sort work across at most 32 tasks, before simulation.",
      "sources": [
        "kernel/src/rate_monotonic.cpp",
        "kernel/src/registry.cpp"
      ],
      "status": "implemented"
    },
    {
      "id": "heap",
      "title": "Binary min-heap",
      "sub": "Shared structure, separate instances",
      "owner": "Marc",
      "summary": "A generic ordered container used by EDF and the heap timer backend.",
      "details": [
        "EDF stores EdfEntry; timers store TimerEntry. These are different heaps with different keys.",
        "Ordering comes from typed values/comparators; identity and ordering are different concepts.",
        "EDF uses an index hook and removeAt; timer cancel by ID still searches.",
        "Storage is reserved up front in the relevant adapters."
      ],
      "mutations": "Heap swaps update tracked EDF indices through a hook.",
      "example": "Smallest deadline goes to the EDF head; smallest wake time goes to the timer head.",
      "cost": "Peek O(1), insert/extract O(log n), timer cancellation O(n) search plus repair.",
      "sources": [
        "ds/include/MinHeap.h",
        "tests/test_minheap.cpp"
      ],
      "status": "implemented"
    },
    {
      "id": "list",
      "title": "Circular list",
      "sub": "Ready rings + resource waiters",
      "owner": "Youssef",
      "summary": "The same generic container supports two different ordering policies.",
      "details": [
        "Ready-ring rotation implements round-robin within one priority.",
        "ResourceManager inserts waiters in descending effective priority and FIFO ties.",
        "Each list owns its nodes; the Job pointers inside are borrowed from Registry.",
        "readyNode and waitNode identify different nodes and different memberships.",
        "Resource insertion rotates to the position and restores the head, preserving existing handles."
      ],
      "mutations": "Owners of each queue mutate their own nodes. List itself has no scheduler policy.",
      "example": "Container reuse does not mean the ready list and mutex wait list are the same queue.",
      "cost": "Push/remove/rotate O(1) link work; ordered waiter insertion O(n).",
      "sources": [
        "ds/include/circular_list.h",
        "ds/src/circular_list.tpp",
        "kernel/src/resource_manager.cpp"
      ],
      "status": "implemented"
    },
    {
      "id": "resources",
      "title": "ResourceManager",
      "sub": "Ownership & permit decisions",
      "owner": "Moataz",
      "summary": "Owns mutex/semaphore records and decides acquire, block and grant behavior.",
      "details": [
        "lock/unlock and wait/signal operate only on valid running callers.",
        "Waiting order is effective priority descending, FIFO within equal priority.",
        "Owns resource state, never edits scheduler ready rings or bitmap.",
        "Runtime guards forbid an owner from sleeping, suspending, WAITing or completing.",
        "Hook failure invalidates the run; later mutation is refused. No general rollback is promised."
      ],
      "mutations": "Sets resource ownership, wait metadata and state, then notifies scheduler membership hooks.",
      "example": "ResourceManager decides who gets the lock; Scheduler decides who runs next.",
      "cost": "Resource lookup scans up to 8 records per kind; insertion O(waiters).",
      "sources": [
        "kernel/include/resource_manager.h",
        "kernel/src/resource_manager.cpp"
      ],
      "status": "implemented"
    },
    {
      "id": "mutex",
      "title": "Mutex",
      "sub": "Exclusive owner",
      "owner": "Moataz",
      "summary": "One job owns a mutex; only that owner may unlock it.",
      "details": [
        "Free LOCK sets ownerJobId and the Job's heldMutexId.",
        "Occupied LOCK inserts a waiter, sets BLOCKED/Mutex and calls onBlocked.",
        "UNLOCK clears old ownership, restores priority and grants directly to the best eligible waiter.",
        "Suspended mutex waiters are skipped for ownership but remain queued.",
        "One held mutex per job: no recursive, nested or chained-lock model."
      ],
      "mutations": "ownerJobId ↔ heldMutexId must agree; blockedResourceId and waitNode track the wait.",
      "example": "Analogy: one bathroom key. The holder must return it; another task cannot unlock on its behalf.",
      "cost": "Direct grant uses known waiter node; skipping suspended waiters can be O(n).",
      "sources": [
        "kernel/src/resource_manager.cpp",
        "scenarios/priority_inversion.md"
      ],
      "status": "implemented"
    },
    {
      "id": "semaphore",
      "title": "Semaphore",
      "sub": "Permits, no owner",
      "owner": "Moataz",
      "summary": "WAIT consumes a permit; SIGNAL supplies one or grants a pending wait directly.",
      "details": [
        "count > 0: WAIT decrements and continues. count = 0: waiter blocks.",
        "SIGNAL with waiters resolves the first WAIT; it does not increment count as well.",
        "Without waiters, SIGNAL increments count up to maxCount; overflow is an error.",
        "A suspended semaphore waiter may receive its permit but remains suspended.",
        "There is no owner-only signal rule and no priority inheritance for semaphores."
      ],
      "mutations": "count OR wait resolution changes per signal; never create a spare permit alongside a direct grant.",
      "example": "Producer makes a part and signals; consumer waits before assembling it.",
      "cost": "Handoff O(1) link work; ordered insertion O(n).",
      "sources": [
        "kernel/src/resource_manager.cpp",
        "scenarios/semaphore_signal.md"
      ],
      "status": "implemented"
    },
    {
      "id": "waiters",
      "title": "Ordered wait queues",
      "sub": "Priority, then arrival",
      "owner": "Moataz",
      "summary": "A resource's waiter ring contains borrowed pointers to blocked/suspended Jobs.",
      "details": [
        "Higher effective priority comes first; equal priorities preserve arrival order.",
        "Job::waitSequence records arrival, and waitNode supports removal.",
        "A successful direct handoff removes the wait node and clears blocking metadata.",
        "A mutex recipient may inherit from remaining waiters before onReady inserts it.",
        "Suspension does not erase the underlying wait."
      ],
      "mutations": "waitNode, waitSequence, blockReason, blockedResourceId; resolving a wait resets quantum.",
      "example": "Waiters P3-first, P3-second, P1 are granted in that order if eligible.",
      "cost": "Insert O(n); remove via node O(1).",
      "sources": [
        "kernel/src/resource_manager.cpp",
        "kernel/include/types.h"
      ],
      "status": "implemented"
    },
    {
      "id": "inheritance",
      "title": "Priority inheritance",
      "sub": "Donation + restoration",
      "owner": "Moataz",
      "summary": "An urgent mutex waiter temporarily boosts the owner so it can release the lock sooner.",
      "details": [
        "effective priority = max(owner base priority, highest waiter effective priority).",
        "Donation includes suspended mutex waiters; no semaphore donation.",
        "Base priority remains unchanged. Unlock restores base priority.",
        "ResourceManager creates ResourcePriorityChange {jobId, mutexId, from, to, reason}.",
        "Component tests reproduce H finishing at 9 OFF and 5 ON. Production callback integration is still missing."
      ],
      "mutations": "Writes Job::effectivePriority before calling onPriorityChanged; callback must relocate existing ready membership using change.from/change.to.",
      "example": "L owns R; H waits; boosting L prevents medium-priority M from delaying the release.",
      "cost": "Highest waiter is at the ordered head. Single-lock restriction avoids donation chains.",
      "sources": [
        "kernel/src/resource_manager.cpp",
        "tests/test_resource_manager.cpp"
      ],
      "status": "component"
    },
    {
      "id": "hooks",
      "title": "Scheduler callbacks",
      "sub": "The integration seam",
      "owner": "Youssef + Moataz",
      "summary": "Resource decisions reach ready queues through callbacks, not direct queue edits.",
      "details": [
        "onBlocked: ResourceManager already marked BLOCKED; Scheduler removes runnable membership.",
        "onReady: wait resolved and state READY; Scheduler enqueues once.",
        "onPriorityChanged: effectivePriority already changed; use explicit old/new values, preserve state and quantum.",
        "Callbacks must be synchronous, must not dispatch recursively, and must not reenter resource mutation."
      ],
      "mutations": "Scheduler owns readyNode, ring/heap membership and bitmap updates.",
      "example": "A job granted a mutex may have no readyNode yet: record priority change, then onReady inserts at the final priority.",
      "cost": "Each known-handle ring move has O(1) link work plus allocation.",
      "sources": [
        "kernel/include/resource_manager.h",
        "kernel/src/scheduler.cpp"
      ],
      "status": "implemented"
    },
    {
      "id": "gap",
      "title": "Missing inheritance connection",
      "sub": "Current integration gap",
      "owner": "Youssef + Moataz",
      "summary": "Scheduler does not override onPriorityChanged, so production donation invokes the default throwing callback.",
      "details": [
        "Scheduler has changeEffectivePriority(job,newPriority,reason), but that is a different method and is not the required override.",
        "That method reads the current priority as 'old' and returns when it equals newPriority.",
        "ResourceManager has already written the new priority before notifying; simply forwarding to that method would therefore skip the move.",
        "The adapter must use ResourcePriorityChange.from/to to move the node and emit the event.",
        "This map explains the gap; it does not edit either teammate's implementation."
      ],
      "mutations": "Required: move old ring → new ring, keep bits/handles/state/quantum coherent, record PRIORITY_CHANGE.",
      "example": "Inheritance ON is not yet an end-to-end engine success at revision 73fead4.",
      "cost": "Static code finding; see the source references.",
      "sources": [
        "kernel/include/resource_manager.h",
        "kernel/include/scheduler.h",
        "kernel/src/scheduler.cpp"
      ],
      "status": "gap"
    },
    {
      "id": "states",
      "title": "States + suspension",
      "sub": "Readiness is not ownership",
      "owner": "Youssef + Moataz",
      "summary": "READY, RUNNING, BLOCKED, SUSPENDED and COMPLETED describe execution availability.",
      "details": [
        "READY → RUNNING on dispatch; RUNNING → READY on preemption/rotation.",
        "RUNNING → BLOCKED when sleep, LOCK or WAIT cannot continue.",
        "Grant/expiry clears wait; job becomes READY only if not suspended.",
        "suspended is separate from blockReason. Resume with unresolved wait returns to BLOCKED.",
        "COMPLETED retains its record for results but has no runnable membership."
      ],
      "mutations": "State writers: Scheduler for dispatch/control/end; Resources for resource waits/grants; Timers for sleep/expiry.",
      "example": "Timer expires while job is suspended: wait ends, but the job does not run until resume.",
      "cost": "Check state plus wait metadata; state alone cannot explain everything.",
      "sources": [
        "kernel/include/types.h",
        "kernel/src/scheduler.cpp",
        "kernel/src/timer_manager.cpp"
      ],
      "status": "implemented"
    },
    {
      "id": "controls",
      "title": "Suspend / resume",
      "sub": "Timed external controls",
      "owner": "Youssef",
      "summary": "ControlAction inputs target a task's latest unfinished job at a chosen tick.",
      "details": [
        "Controls are not task script opcodes; they are separate scenario inputs.",
        "Suspend removes runnable membership but preserves existing timer/resource waits.",
        "Resume enqueues only if the wait is resolved; otherwise keeps blocking.",
        "Resume of a mutex waiter calls resumeMutexWait to retry a free mutex.",
        "Suspending a mutex owner is forbidden by resource rules."
      ],
      "mutations": "suspended, state, queue membership; unresolved timer/resource fields remain.",
      "example": "Suspended at tick 4, timer due at 5, resumed at 7: no CPU execution before 7.",
      "cost": "Bounded control array; handles make removal efficient.",
      "sources": [
        "kernel/include/scheduler.h",
        "kernel/src/scheduler.cpp",
        "scenarios/suspend_resume.md"
      ],
      "status": "implemented"
    },
    {
      "id": "timers",
      "title": "TimerManager",
      "sub": "Sleep → ordered wake",
      "owner": "Sarofem",
      "summary": "Maintains sleeping jobs behind one interface with two interchangeable backends.",
      "details": [
        "sleep(id,t,n) validates, creates one timer and sets BLOCKED/Timer with wakeTick=t+n.",
        "expireDue runs in INPUTS after releases; removes all due timers in stable order.",
        "Clears timer/wait fields, resets quantum and returns borrowed Job pointers in the wake batch.",
        "Suspended wakers remain SUSPENDED. Scheduler enqueues only READY wakers.",
        "Never edits ready rings, bitmap or scriptIndex."
      ],
      "mutations": "timerId, wakeTick, blockReason, state and quantum; scheduler separately handles runnable membership.",
      "example": "B and D wake at 110 in insertion order on both backends.",
      "cost": "Sorted-list insert O(n), heap O(log n); both peek O(1).",
      "sources": [
        "kernel/include/timer_manager.h",
        "kernel/src/timer_manager.cpp"
      ],
      "status": "implemented"
    },
    {
      "id": "timerentry",
      "title": "TimerEntry + TimerQueue",
      "sub": "Order differs from identity",
      "owner": "Moataz + Sarofem",
      "summary": "TimerEntry defines stable keys; TimerQueue hides the storage implementation.",
      "details": [
        "TimerEntry fields: timerId, jobId, wakeTick, insertionSequence, active.",
        "operator< compares (wakeTick, insertionSequence); operator== compares timerId only.",
        "TimerQueueAdapter<Storage> forwards insert/peek/pop/remove to list or heap.",
        "Uses values and job IDs; it does not own or delete Job records."
      ],
      "mutations": "Insertion/removal changes queue entries; expiry uses Registry to resolve the referenced Job.",
      "example": "Cancel timer 7 by identity even if another timer has the same wakeTick.",
      "cost": "Cancel by ID requires a search in both backends.",
      "sources": [
        "kernel/include/types.h",
        "kernel/include/timer_manager.h"
      ],
      "status": "implemented"
    },
    {
      "id": "sorted",
      "title": "Sorted timer list",
      "sub": "Simple ordered backend",
      "owner": "Sarofem",
      "summary": "Keeps timers sorted so the next due timer is always at the head.",
      "details": [
        "Insert searches for the stable (wakeTick, sequence) position.",
        "Head expiry is cheap; cancelling a specific ID searches.",
        "One node allocation per sleep is a real cost beyond link work.",
        "Shares the same TimerQueue API as the heap backend."
      ],
      "mutations": "Owns timer nodes, not Jobs.",
      "example": "Many ordered insertions trade cheaper expiry for more insertion work.",
      "cost": "Insert O(n); head pop O(1); cancel O(n).",
      "sources": [
        "ds/include/sortedList.h",
        "ds/src/sortedList.tpp",
        "kernel/include/timer_manager.h"
      ],
      "status": "implemented"
    },
    {
      "id": "array",
      "title": "DynamicArray wake batch",
      "sub": "Reused borrowed Job pointers",
      "owner": "Sarofem",
      "summary": "A reserved buffer returns all due jobs from TimerManager to Scheduler.",
      "details": [
        "Scheduler reserves maxJobs capacity ahead of the run.",
        "expireDue clears the buffer then appends woken pointers in timer order.",
        "No fresh growth is needed during normal expiry batches.",
        "The buffer owns its storage, not the pointed-to jobs."
      ],
      "mutations": "Clears/appends buffer entries; caller inspects Job state before enqueue.",
      "example": "Ten timers due together produce ten entries, not ten separate scheduler callbacks.",
      "cost": "O(1) indexed access; producing k wake results is at least O(k).",
      "sources": [
        "ds/include/DynamicArray.h",
        "kernel/src/timer_manager.cpp",
        "kernel/include/scheduler.h"
      ],
      "status": "implemented"
    },
    {
      "id": "wheel",
      "title": "Timing wheel",
      "sub": "Separate tested experiment",
      "owner": "Bavly",
      "summary": "Buckets and round counts organize timers by future slot; this is not a TimerManager backend.",
      "details": [
        "The production TimerBackend enum contains only SortedList and Heap.",
        "Bavly repaired empty-wheel advancement, future-slot cancellation and lap behavior.",
        "Tests cover exact and multiple laps.",
        "Do not draw the wheel as if the scheduler currently sleeps through it."
      ],
      "mutations": "Moves wheel position/round counts and its own timer buckets; does not mutate production scheduler Jobs through TimerManager.",
      "example": "Analogy: a clock with reminder buckets; reminders for later revolutions keep a lap count.",
      "cost": "Add O(1); tick O(timers in slot); cancel O(W+N).",
      "sources": [
        "ds/include/timing_wheel.h",
        "ds/src/timing_wheel.cpp",
        "tests/test_timing_wheel.cpp"
      ],
      "status": "separate"
    },
    {
      "id": "trace",
      "title": "RunTrace",
      "sub": "Events, segments & snapshots",
      "owner": "Sarofem",
      "summary": "Records the engine's decisions and stable state for inspection after the run.",
      "details": [
        "Events are ordered by tick, phase and sequence.",
        "CPU segments record job or idle intervals; adjacent compatible intervals can be merged.",
        "A snapshot copies job, ready, sleep and resource state at a boundary.",
        "Limit overflow marks the run invalid instead of silently dropping evidence.",
        "Trace work is separate from dispatch complexity."
      ],
      "mutations": "Appends bounded event/segment/snapshot records; does not choose jobs.",
      "example": "Snapshot at t shows decisions at t, before CPU interval [t,t+1).",
      "cost": "Snapshot capture O(released jobs) each tick.",
      "sources": [
        "kernel/include/run_trace.h",
        "kernel/src/run_trace.cpp"
      ],
      "status": "implemented"
    },
    {
      "id": "bounded",
      "title": "BoundedArray",
      "sub": "Fixed-capacity trace storage",
      "owner": "Sarofem",
      "summary": "Trace containers allocate from configured limits and never grow during recording.",
      "details": [
        "One allocation per array at construction.",
        "Capacity is an explicit run contract.",
        "Push past capacity is a visible failure, not silent truncation.",
        "This is different from the reusable DynamicArray wake batch."
      ],
      "mutations": "Appends trace values inside a fixed capacity.",
      "example": "100,000 snapshot job rows can fill before a 2,000-tick run if many jobs exist throughout.",
      "cost": "Push O(1); memory bounded by configured ceilings.",
      "sources": [
        "ds/include/bounded_array.h",
        "kernel/src/run_trace.cpp"
      ],
      "status": "implemented"
    },
    {
      "id": "metrics",
      "title": "Metrics",
      "sub": "Measure completed runs",
      "owner": "Marc",
      "summary": "Computes measurements from Registry outcomes and recorded CPU segments.",
      "details": [
        "Response = completion - release; only completed jobs enter response samples, including late completions.",
        "Jitter = max response - min response; absent below two completed samples.",
        "Busy percentage = non-idle ticks / horizon × 100; distinct from demand Σ(C/T).",
        "Counts unfinished jobs and missed jobs. A late completion does not erase a miss.",
        "RM bound n(2^(1/n)-1) is labelled applicable only for the supported RM assumptions; above the bound can be inconclusive."
      ],
      "mutations": "Writes a RunMetrics result; does not alter schedule or job progress.",
      "example": "A job released at 1 and completed at 9 has response 8, not 9.",
      "cost": "Scans segments and jobs after simulation; not part of dispatch.",
      "sources": [
        "app/include/metrics.h",
        "app/src/metrics.cpp",
        "tests/test_metrics.cpp"
      ],
      "status": "implemented"
    },
    {
      "id": "export",
      "title": "JSON exporter",
      "sub": "Engine → portable recording",
      "owner": "Sarofem",
      "summary": "Serializes schemaVersion 1 from task/job records, trace and optional metrics.",
      "details": [
        "Exports config, metadata, tasks, jobs, events, segments, snapshots, metrics and validation.",
        "Optional unknown times serialize to null, not 0. Pointers are never serialized.",
        "engine_run labels actual engine output; design_fixture labels hand-authored samples.",
        "Invalid runs retain explicit error/limit information and have no completed-run metrics.",
        "Proper string escaping prevents names from breaking JSON."
      ],
      "mutations": "Creates a file/stream; leaves live scheduler state unchanged.",
      "example": "A run file is the one-way contract between C++ and the browser.",
      "cost": "Serialization cost grows with recorded rows.",
      "sources": [
        "app/src/run_exporter.cpp",
        "docs/run-schema-v1.md"
      ],
      "status": "implemented"
    },
    {
      "id": "dashboard",
      "title": "Dashboard",
      "sub": "Replay, never reschedule",
      "owner": "Bavly",
      "summary": "An offline HTML/CSS/JS viewer imports and displays exported recordings.",
      "details": [
        "Shows selected-tick snapshots, CPU Gantt, jobs, mutex owners, waiters, permits and events.",
        "Play/slider choose recorded time; policy/run selection does not run algorithms.",
        "Metrics are displayed from the file, not recomputed.",
        "Import validates structure, IDs, ordering, states and limits.",
        "Sample and invalid runs must be visibly distinguished from successful engine runs."
      ],
      "mutations": "Changes selected run, tick and inspector UI state only; never mutates C++ Jobs.",
      "example": "Import a real inversion-OFF file and inspect H blocked while L owns mutex 0.",
      "cost": "Browser work is presentation, not assessed C++ scheduler decision cost.",
      "sources": [
        "dashboard/index.html",
        "dashboard/app.js",
        "dashboard/README.md"
      ],
      "status": "implemented"
    },
    {
      "id": "tests",
      "title": "Tests + golden traces",
      "sub": "Evidence, not a second engine",
      "owner": "Team",
      "summary": "Independent expectations check structures, components, integration and presentation.",
      "details": [
        "Foundation/resource tests exercise Moataz's records and synchronization, including both inversion oracles.",
        "Scheduler tests check traces, state invariants, repeatability, CPU conservation and deadline boundaries.",
        "Timer tests compare wake order; export tests check schema and escaping.",
        "Dashboard import/view/browser tests verify the viewer.",
        "A diagram or sample trace is explanatory evidence, not an automatic proof of the integrated engine."
      ],
      "mutations": "Tests construct isolated runs and compare actual outputs with expected ones.",
      "example": "Expected OFF H=9 and ON H=5 must agree with real engine output before claiming integrated ON works.",
      "cost": "No tests were rerun merely to generate this map; status is based on source inspection.",
      "sources": [
        "tests/test_resource_manager.cpp",
        "tests/test_scheduler.cpp",
        "dashboard/browser.check.js"
      ],
      "status": "implemented"
    },
    {
      "id": "experiments",
      "title": "Policy + timer experiments",
      "sub": "Measured comparisons",
      "owner": "Marc + Sarofem",
      "summary": "Golden comparisons and timer operation counts expose behavior and trade-offs.",
      "details": [
        "RM and EDF use the same releases and workload so the policy comparison is fair.",
        "A:C2/T5, B:C4/T7: RM makes B0 late at 8; EDF completes it at 6 before deadline 7.",
        "Timer tests compare list and heap at different populations.",
        "Count comparisons, moves and traversals separately; these are not hardware timing guarantees."
      ],
      "mutations": "Produces result tables, not live scheduling decisions.",
      "example": "Above an RM sufficient bound is not automatically proof of infeasibility.",
      "cost": "See measured tables and assumptions in docs/results.md.",
      "sources": [
        "experiments/golden_compare.cpp",
        "experiments/timer_cost.cpp",
        "docs/results.md"
      ],
      "status": "implemented"
    },
    {
      "id": "avl",
      "title": "AVL tree",
      "sub": "Deliberately out of scope",
      "owner": "Youssef",
      "summary": "An older plan mentioned AVL, but the team documented why it is not implemented.",
      "details": [
        "Selection already uses bitmap/rings or min-heaps.",
        "No required operation needs balanced ordered-key range search.",
        "The scope decision is recorded in docs/scheduler.md.",
        "Do not claim an AVL implementation in the discussion."
      ],
      "mutations": "None: absent from the current implementation.",
      "example": "Another tree is not needed merely to add a data structure.",
      "cost": "Not implemented.",
      "sources": [
        "docs/scheduler.md"
      ],
      "status": "separate"
    }
  ],
  "edges": [
    {
      "a": "cli",
      "b": "config",
      "label": "builds",
      "type": "flow",
      "note": "builds"
    },
    {
      "a": "cli",
      "b": "simulation",
      "label": "starts",
      "type": "flow",
      "note": "starts"
    },
    {
      "a": "config",
      "b": "registry",
      "label": "copied input",
      "type": "owns",
      "note": "copied input"
    },
    {
      "a": "config",
      "b": "validation",
      "label": "checked by",
      "type": "flow",
      "note": "checked by"
    },
    {
      "a": "simulation",
      "b": "registry",
      "label": "owns",
      "type": "owns",
      "note": "owns"
    },
    {
      "a": "simulation",
      "b": "scheduler",
      "label": "constructs & runs",
      "type": "owns",
      "note": "constructs & runs"
    },
    {
      "a": "simulation",
      "b": "trace",
      "label": "owns",
      "type": "owns",
      "note": "owns"
    },
    {
      "a": "simulation",
      "b": "resources",
      "label": "owns if needed",
      "type": "owns",
      "note": "owns if needed"
    },
    {
      "a": "simulation",
      "b": "timers",
      "label": "owns",
      "type": "owns",
      "note": "owns"
    },
    {
      "a": "registry",
      "b": "validation",
      "label": "validates before publishing",
      "type": "flow",
      "note": "validates before publishing"
    },
    {
      "a": "registry",
      "b": "rm",
      "label": "assigns RM before validation",
      "type": "flow",
      "note": "assigns RM before validation"
    },
    {
      "a": "registry",
      "b": "task",
      "label": "owns immutable definitions",
      "type": "owns",
      "note": "owns immutable definitions"
    },
    {
      "a": "registry",
      "b": "job",
      "label": "owns stable records",
      "type": "owns",
      "note": "owns stable records"
    },
    {
      "a": "registry",
      "b": "hash",
      "label": "indexes IDs",
      "type": "flow",
      "note": "indexes IDs"
    },
    {
      "a": "hash",
      "b": "job",
      "label": "borrows pointers",
      "type": "reference",
      "note": "borrows pointers"
    },
    {
      "a": "task",
      "b": "job",
      "label": "one per release",
      "type": "flow",
      "note": "one per release"
    },
    {
      "a": "scheduler",
      "b": "registry",
      "label": "releaseJob / findJob",
      "type": "flow",
      "note": "releaseJob / findJob"
    },
    {
      "a": "scheduler",
      "b": "job",
      "label": "progress + ready state",
      "type": "mutation",
      "note": "progress + ready state"
    },
    {
      "a": "scheduler",
      "b": "phases",
      "label": "drives boundary order",
      "type": "flow",
      "note": "drives boundary order"
    },
    {
      "a": "scheduler",
      "b": "ready",
      "label": "fixed priority / RM",
      "type": "flow",
      "note": "fixed priority / RM"
    },
    {
      "a": "ready",
      "b": "bitmap",
      "label": "synchronizes bits",
      "type": "mutation",
      "note": "synchronizes bits"
    },
    {
      "a": "ready",
      "b": "list",
      "label": "uses rings",
      "type": "flow",
      "note": "uses rings"
    },
    {
      "a": "rm",
      "b": "ready",
      "label": "assigned fixed priorities",
      "type": "flow",
      "note": "assigned fixed priorities"
    },
    {
      "a": "scheduler",
      "b": "edf",
      "label": "EDF mode",
      "type": "flow",
      "note": "EDF mode"
    },
    {
      "a": "edf",
      "b": "heap",
      "label": "uses EDF heap",
      "type": "flow",
      "note": "uses EDF heap"
    },
    {
      "a": "edf",
      "b": "job",
      "label": "tracks heap index",
      "type": "mutation",
      "note": "tracks heap index"
    },
    {
      "a": "scheduler",
      "b": "states",
      "label": "dispatch / complete",
      "type": "mutation",
      "note": "dispatch / complete"
    },
    {
      "a": "controls",
      "b": "scheduler",
      "label": "timed inputs",
      "type": "flow",
      "note": "timed inputs"
    },
    {
      "a": "controls",
      "b": "states",
      "label": "suspend / resume",
      "type": "mutation",
      "note": "suspend / resume"
    },
    {
      "a": "scheduler",
      "b": "resources",
      "label": "LOCK / WAIT / release",
      "type": "flow",
      "note": "LOCK / WAIT / release"
    },
    {
      "a": "resources",
      "b": "mutex",
      "label": "owns records",
      "type": "owns",
      "note": "owns records"
    },
    {
      "a": "resources",
      "b": "semaphore",
      "label": "owns records",
      "type": "owns",
      "note": "owns records"
    },
    {
      "a": "resources",
      "b": "job",
      "label": "wait + ownership fields",
      "type": "mutation",
      "note": "wait + ownership fields"
    },
    {
      "a": "mutex",
      "b": "waiters",
      "label": "queues blocked jobs",
      "type": "flow",
      "note": "queues blocked jobs"
    },
    {
      "a": "semaphore",
      "b": "waiters",
      "label": "queues blocked jobs",
      "type": "flow",
      "note": "queues blocked jobs"
    },
    {
      "a": "waiters",
      "b": "list",
      "label": "uses ordered rings",
      "type": "flow",
      "note": "uses ordered rings"
    },
    {
      "a": "waiters",
      "b": "job",
      "label": "borrows Job pointers",
      "type": "reference",
      "note": "borrows Job pointers"
    },
    {
      "a": "mutex",
      "b": "inheritance",
      "label": "blocked waiter donates",
      "type": "flow",
      "note": "blocked waiter donates"
    },
    {
      "a": "inheritance",
      "b": "job",
      "label": "writes effectivePriority",
      "type": "mutation",
      "note": "writes effectivePriority"
    },
    {
      "a": "inheritance",
      "b": "hooks",
      "label": "onPriorityChanged",
      "type": "gap",
      "note": "Required callback exists in resource interface; production Scheduler does not override it."
    },
    {
      "a": "resources",
      "b": "hooks",
      "label": "onBlocked / onReady",
      "type": "flow",
      "note": "onBlocked / onReady"
    },
    {
      "a": "hooks",
      "b": "ready",
      "label": "remove / enqueue",
      "type": "mutation",
      "note": "remove / enqueue"
    },
    {
      "a": "hooks",
      "b": "gap",
      "label": "priority override missing",
      "type": "gap",
      "note": "priority override missing"
    },
    {
      "a": "gap",
      "b": "ready",
      "label": "old → new ring required",
      "type": "gap",
      "note": "Use change.from/to; effectivePriority has already changed before callback."
    },
    {
      "a": "resources",
      "b": "states",
      "label": "block / grant",
      "type": "mutation",
      "note": "block / grant"
    },
    {
      "a": "scheduler",
      "b": "timers",
      "label": "sleep / expireDue",
      "type": "flow",
      "note": "sleep / expireDue"
    },
    {
      "a": "timers",
      "b": "job",
      "label": "sleep / wake metadata",
      "type": "mutation",
      "note": "sleep / wake metadata"
    },
    {
      "a": "timers",
      "b": "timerentry",
      "label": "owns queued entries",
      "type": "owns",
      "note": "owns queued entries"
    },
    {
      "a": "timerentry",
      "b": "sorted",
      "label": "sorted_list backend",
      "type": "flow",
      "note": "sorted_list backend"
    },
    {
      "a": "timerentry",
      "b": "heap",
      "label": "heap backend",
      "type": "flow",
      "note": "heap backend"
    },
    {
      "a": "timers",
      "b": "array",
      "label": "fills wake batch",
      "type": "flow",
      "note": "fills wake batch"
    },
    {
      "a": "array",
      "b": "scheduler",
      "label": "returns borrowed wakers",
      "type": "reference",
      "note": "returns borrowed wakers"
    },
    {
      "a": "timers",
      "b": "states",
      "label": "resolve timer wait",
      "type": "mutation",
      "note": "resolve timer wait"
    },
    {
      "a": "wheel",
      "b": "tests",
      "label": "standalone coverage",
      "type": "reference",
      "note": "TimingWheel is tested separately; no production TimerManager connection."
    },
    {
      "a": "scheduler",
      "b": "trace",
      "label": "events + intervals + snapshots",
      "type": "flow",
      "note": "events + intervals + snapshots"
    },
    {
      "a": "trace",
      "b": "bounded",
      "label": "owns bounded storage",
      "type": "owns",
      "note": "owns bounded storage"
    },
    {
      "a": "registry",
      "b": "metrics",
      "label": "job outcomes",
      "type": "reference",
      "note": "job outcomes"
    },
    {
      "a": "trace",
      "b": "metrics",
      "label": "CPU segments",
      "type": "reference",
      "note": "CPU segments"
    },
    {
      "a": "metrics",
      "b": "export",
      "label": "calculated values",
      "type": "flow",
      "note": "calculated values"
    },
    {
      "a": "registry",
      "b": "export",
      "label": "task / job records",
      "type": "reference",
      "note": "task / job records"
    },
    {
      "a": "trace",
      "b": "export",
      "label": "recorded evidence",
      "type": "flow",
      "note": "recorded evidence"
    },
    {
      "a": "export",
      "b": "dashboard",
      "label": "schema v1 JSON",
      "type": "flow",
      "note": "schema v1 JSON"
    },
    {
      "a": "tests",
      "b": "resources",
      "label": "checks semantics",
      "type": "reference",
      "note": "checks semantics"
    },
    {
      "a": "tests",
      "b": "scheduler",
      "label": "checks integration",
      "type": "reference",
      "note": "checks integration"
    },
    {
      "a": "tests",
      "b": "dashboard",
      "label": "checks presentation",
      "type": "reference",
      "note": "checks presentation"
    },
    {
      "a": "experiments",
      "b": "metrics",
      "label": "compares outcomes",
      "type": "flow",
      "note": "compares outcomes"
    },
    {
      "a": "experiments",
      "b": "timers",
      "label": "compares costs",
      "type": "flow",
      "note": "compares costs"
    },
    {
      "a": "avl",
      "b": "scheduler",
      "label": "documented exclusion",
      "type": "reference",
      "note": "documented exclusion"
    }
  ],
  "views": [
    {
      "id": "overview",
      "name": "Whole system",
      "desc": "Follow one run from input to recorded evidence. Select a component to see its connections and owner.",
      "nodes": [
        [
          "cli",
          0,
          0
        ],
        [
          "config",
          0,
          1
        ],
        [
          "registry",
          1,
          0
        ],
        [
          "simulation",
          1,
          1
        ],
        [
          "scheduler",
          2,
          0
        ],
        [
          "resources",
          2,
          1
        ],
        [
          "timers",
          2,
          2
        ],
        [
          "trace",
          3,
          0
        ],
        [
          "metrics",
          3,
          1
        ],
        [
          "export",
          4,
          0
        ],
        [
          "dashboard",
          4,
          1
        ],
        [
          "tests",
          4,
          2
        ]
      ]
    },
    {
      "id": "records",
      "name": "Records & ownership",
      "desc": "Solid blue arrows mean ownership. Dashed lines mean borrowed references. The Job stays in the Registry; pointers move between queues.",
      "nodes": [
        [
          "config",
          0,
          0
        ],
        [
          "validation",
          0,
          1
        ],
        [
          "simulation",
          0,
          2
        ],
        [
          "registry",
          1,
          1
        ],
        [
          "task",
          2,
          0
        ],
        [
          "hash",
          2,
          2
        ],
        [
          "job",
          3,
          1
        ],
        [
          "scheduler",
          4,
          0
        ],
        [
          "resources",
          4,
          1
        ],
        [
          "timers",
          4,
          2
        ]
      ]
    },
    {
      "id": "scheduling",
      "name": "Scheduling",
      "desc": "Fixed priority and RM use rings + bitmap. EDF uses a separate min-heap. These are alternative selection paths.",
      "nodes": [
        [
          "controls",
          0,
          0
        ],
        [
          "phases",
          0,
          1
        ],
        [
          "states",
          0,
          2
        ],
        [
          "scheduler",
          1,
          1
        ],
        [
          "rm",
          2,
          0
        ],
        [
          "ready",
          2,
          1
        ],
        [
          "edf",
          2,
          2
        ],
        [
          "bitmap",
          3,
          0
        ],
        [
          "list",
          3,
          1
        ],
        [
          "heap",
          3,
          2
        ],
        [
          "job",
          4,
          1
        ],
        [
          "avl",
          4,
          2
        ]
      ]
    },
    {
      "id": "resources",
      "name": "Mutex & semaphore",
      "desc": "ResourceManager decides ownership; scheduler callbacks maintain runnable membership. The coral dashed path is the missing production inheritance connection.",
      "nodes": [
        [
          "scheduler",
          0,
          0
        ],
        [
          "job",
          0,
          2
        ],
        [
          "resources",
          1,
          0
        ],
        [
          "mutex",
          2,
          0
        ],
        [
          "semaphore",
          2,
          1
        ],
        [
          "waiters",
          2,
          2
        ],
        [
          "inheritance",
          3,
          0
        ],
        [
          "hooks",
          3,
          1
        ],
        [
          "list",
          3,
          2
        ],
        [
          "gap",
          4,
          0
        ],
        [
          "ready",
          4,
          1
        ],
        [
          "states",
          4,
          2
        ]
      ]
    },
    {
      "id": "timers",
      "name": "Timers & structures",
      "desc": "Both active backends follow the same wake order. The timing wheel is intentionally separate from the production sleep path.",
      "nodes": [
        [
          "scheduler",
          0,
          0
        ],
        [
          "job",
          0,
          2
        ],
        [
          "timers",
          1,
          0
        ],
        [
          "array",
          1,
          1
        ],
        [
          "states",
          1,
          2
        ],
        [
          "timerentry",
          2,
          0
        ],
        [
          "sorted",
          3,
          0
        ],
        [
          "heap",
          3,
          1
        ],
        [
          "wheel",
          3,
          2
        ],
        [
          "experiments",
          4,
          0
        ],
        [
          "tests",
          4,
          2
        ]
      ]
    },
    {
      "id": "evidence",
      "name": "Trace → dashboard",
      "desc": "The browser replays the recording. Metrics and scheduling decisions come from C++, not JavaScript.",
      "nodes": [
        [
          "scheduler",
          0,
          0
        ],
        [
          "registry",
          0,
          1
        ],
        [
          "trace",
          1,
          0
        ],
        [
          "metrics",
          1,
          1
        ],
        [
          "bounded",
          1,
          2
        ],
        [
          "export",
          2,
          0
        ],
        [
          "experiments",
          2,
          2
        ],
        [
          "dashboard",
          3,
          0
        ],
        [
          "tests",
          4,
          1
        ]
      ]
    }
  ],
  "tours": [
    {
      "id": "release",
      "title": "A task becomes a running job",
      "view": "records",
      "steps": [
        [
          "task",
          "Start with a definition",
          "TaskSpec is the reusable script. TCB is just its alias. It does not carry an individual release's progress."
        ],
        [
          "registry",
          "Create a separate release",
          "Scheduler calls releaseJob(taskId,t). Registry creates a stable Job with a new ID and deadline t + relativeDeadline."
        ],
        [
          "job",
          "Initialize execution state",
          "Effective priority starts at task base priority; quantum is set; progress begins at instruction 0."
        ],
        [
          "scheduler",
          "Publish runnable membership",
          "Scheduler enqueues the borrowed Job pointer and later dispatches it. Registry still owns the object."
        ]
      ]
    },
    {
      "id": "mutex",
      "title": "An occupied mutex blocks H",
      "view": "resources",
      "steps": [
        [
          "mutex",
          "L already owns the resource",
          "ownerJobId names L; L.heldMutexId names the same resource. H cannot simply run through the lock."
        ],
        [
          "waiters",
          "Insert H into the ordered wait queue",
          "H gets waitNode and waitSequence. Higher priority comes first, with FIFO ties."
        ],
        [
          "resources",
          "Set H's blocked fields",
          "Set state=BLOCKED, blockReason=Mutex, blockedResourceId=R. onBlocked asks Scheduler to remove ready membership."
        ],
        [
          "hooks",
          "Remove H from the runnable ring",
          "Scheduler clears H.readyNode and updates the bitmap. No dispatch occurs recursively inside the callback."
        ],
        [
          "mutex",
          "Unlock hands ownership directly",
          "Only L can unlock. The first eligible waiter receives ownership before being readied; another job cannot steal the released mutex."
        ]
      ]
    },
    {
      "id": "pi",
      "title": "Donation crosses a module boundary",
      "view": "resources",
      "steps": [
        [
          "inheritance",
          "H waits, L inherits urgency",
          "ResourceManager calculates max(L.basePriority, highest waiting priority). H's priority 3 boosts L from 1 to 3."
        ],
        [
          "job",
          "Write effective priority, retain base",
          "ResourceManager changes L.effectivePriority and stores old=1/new=3 in ResourcePriorityChange. Base priority remains 1."
        ],
        [
          "hooks",
          "Notify the scheduler",
          "onPriorityChanged must use the supplied old/new values to move existing ready membership while preserving quantum and state."
        ],
        [
          "gap",
          "The production connection is missing",
          "Current Scheduler does not override that callback. Its separate changeEffectivePriority cannot simply be forwarded to: the field already equals the new value."
        ],
        [
          "inheritance",
          "Restore when L unlocks",
          "Component tests show L returning to 1 at tick 4 and H finishing at 5. This expected ON path is not a working production engine trace at this revision."
        ]
      ]
    },
    {
      "id": "permit",
      "title": "Producer signals a waiting consumer",
      "view": "resources",
      "steps": [
        [
          "semaphore",
          "Start with no permits",
          "count=0. Consumer C executes WAIT and cannot continue."
        ],
        [
          "waiters",
          "Consumer joins the wait queue",
          "ResourceManager blocks C; onBlocked removes it from the ready ring. Producer P can run."
        ],
        [
          "semaphore",
          "Producer SIGNALs",
          "The signal completes C's existing WAIT directly. count stays 0: no extra permit is created."
        ],
        [
          "hooks",
          "Consumer becomes ready",
          "The wait node and blocking fields are cleared; onReady enqueues C if not suspended. Its higher priority wins at stabilization."
        ],
        [
          "scheduler",
          "Continue after WAIT, not at WAIT",
          "scriptIndex was already advanced once when WAIT blocked. C runs its next instruction rather than consuming a second permit."
        ]
      ]
    },
    {
      "id": "sleep",
      "title": "A suspended sleeper wakes",
      "view": "timers",
      "steps": [
        [
          "timers",
          "SLEEP records a future wake",
          "At t, SLEEP n creates wakeTick=t+n, marks BLOCKED/Timer and queues a TimerEntry."
        ],
        [
          "timerentry",
          "Order by wake tick and sequence",
          "Both sorted-list and heap backends use the same key. Equal wake times preserve insertion order."
        ],
        [
          "states",
          "Suspend does not cancel sleep",
          "The suspended flag becomes true. Timer ID and wake tick remain until expiry."
        ],
        [
          "array",
          "Expiry produces a waker",
          "At the due tick TimerManager clears the wait and appends the borrowed Job pointer, but the job remains SUSPENDED."
        ],
        [
          "scheduler",
          "Resume decides runnable status",
          "Scheduler enqueues only READY wakers. A later resume sees no unresolved wait and makes the job READY."
        ]
      ]
    },
    {
      "id": "output",
      "title": "From CPU decisions to the website",
      "view": "evidence",
      "steps": [
        [
          "scheduler",
          "Execute the scenario",
          "C++ makes the actual dispatch decisions and interprets scripts."
        ],
        [
          "trace",
          "Copy events and snapshots",
          "The stable state at t is copied before executing [t,t+1). The browser will not need to reconstruct it."
        ],
        [
          "metrics",
          "Compute completed-run measurements",
          "Response samples, misses, busy percentage and applicable bounds come from the finished engine results."
        ],
        [
          "export",
          "Write one schema-v1 file",
          "JSON contains IDs and values, never pointers. engine_run and design_fixture have distinct evidence labels."
        ],
        [
          "dashboard",
          "Replay the recording",
          "The slider selects a recorded tick. It does not rerun the scheduling policy or mutate a C++ Job."
        ]
      ]
    }
  ],
  "revision": "73fead4",
  "date": "23 November 2026"
};

